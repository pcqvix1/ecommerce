// api/users.js
const { query } = require('./pg'); 
const bcrypt = require('bcryptjs'); 
const { parseBody } = require('./utils'); 

// Constantes
const SALT_ROUNDS = 10; 

// ────────────────────────────────
// Função auxiliar: verifica se o usuário existe
// ────────────────────────────────
async function checkUserExists(email) {
    const result = await query('SELECT email, password_hash, name, google FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    return {
        email: user.email,
        name: user.name,
        hasPassword: user.password_hash ? true : null,
        google: user.google
    };
}

// ────────────────────────────────
// Registro padrão (com senha)
// ────────────────────────────────
async function handleRegister(name, email, password) {
    const existingUser = await checkUserExists(email);

    if (existingUser) {
        if (existingUser.google) {
            return { success: false, message: 'Este e-mail está registado com o Google. Use o botão "Entrar com Google".' };
        }
        return { success: false, message: 'Este e-mail já está registado.' };
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)', [name, email, passwordHash]);
        return { success: true, message: 'Usuário registado com sucesso.' };
    } catch (error) {
        console.error('Erro ao registar usuário padrão:', error);
        return { success: false, message: 'Erro interno ao registar o usuário.' };
    }
}

// ────────────────────────────────
// Login (Google ou padrão)
// ────────────────────────────────
// 🔑 Login unificado (Google + Padrão)
async function handleLogin(email, password, name) {
    const existingUser = await checkUserExists(email);

    // 1️⃣ LOGIN GOOGLE: password ausente, null, undefined ou string vazia
    if (!password || password === '') {
        // Se o usuário não existir, cria conta Google
        if (!existingUser) {
            try {
                const displayName = name || email.split('@')[0]; // fallback se o Google não mandar nome
                await query(
                    'INSERT INTO users (name, email, google, password_hash) VALUES ($1, $2, TRUE, NULL)',
                    [displayName, email]
                );
                return {
                    success: true,
                    user: { email, name: displayName, hasPassword: null, google: true }
                };
            } catch (error) {
                console.error('Erro ao criar conta Google:', error);
                return { success: false, message: 'Falha ao criar nova conta Google.' };
            }
        }

        // Se já existir, loga normalmente (sem pedir senha)
        return {
            success: true,
            user: {
                email,
                name: existingUser.name,
                hasPassword: existingUser.hasPassword,
                google: true
            }
        };
    }

    // 2️⃣ LOGIN NORMAL: com senha
    if (password) {
        if (!existingUser) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        if (existingUser.google) {
            // Login com senha em conta Google: bloqueia
            return { success: false, message: 'Esta conta foi criada com o Google. Use o botão "Entrar com Google".' };
        }

        const result = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
        const hash = result.rows[0]?.password_hash;
        if (!hash) return { success: false, message: 'E-mail ou senha incorretos.' };

        const isMatch = await bcrypt.compare(password, hash);
        if (!isMatch) return { success: false, message: 'E-mail ou senha incorretos.' };

        return {
            success: true,
            user: { email, name: existingUser.name, hasPassword: true, google: false }
        };
    }

    return { success: false, message: 'Dados de login insuficientes.' };
}

// ────────────────────────────────
// Handler principal (para Vercel)
// ────────────────────────────────
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).end();
    }

    const body = parseBody(req);
    if (!body || !body.action) {
        return res.status(400).json({ success: false, message: 'Ação de usuário não especificada.' });
    }

    try {
        const { action, email, password, name, newPassword } = body;
        let result;

        if (!email) {
            return res.status(400).json({ success: false, message: 'O e-mail é obrigatório.' });
        }

        switch (action) {
            case 'register':
                if (!password || !name)
                    return res.status(400).json({ success: false, message: 'Nome e senha são obrigatórios para o registo padrão.' });
                result = await handleRegister(name, email, password);
                break;

            case 'login':
                result = await handleLogin(email, password, name);
                break;

            case 'changePassword':
                if (!password || !newPassword)
                    return res.status(400).json({ success: false, message: 'Senha atual e nova senha são obrigatórias.' });
                result = await handleChangePassword(email, password, newPassword);
                break;

            default:
                return res.status(400).json({ success: false, message: 'Ação inválida.' });
        }

        if (!result.success && action === 'login') return res.status(401).json(result);
        if (!result.success && action === 'register') return res.status(409).json(result);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Erro geral na requisição /api/users:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao processar o usuário.' });
    }
};
