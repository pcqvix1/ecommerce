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
async function handleLogin(email, password, name) {
    const existingUser = await checkUserExists(email);

    // LOGIN GOOGLE (sem password)
    if (password === undefined || password === null) {
        if (!existingUser && name) {
            try {
                await query(
                    'INSERT INTO users (name, email, google, password_hash) VALUES ($1, $2, TRUE, NULL)',
                    [name, email]
                );
                return {
                    success: true,
                    user: { email, name, hasPassword: null, google: true }
                };
            } catch (error) {
                console.error('Erro ao registar novo usuário Google:', error);
                return { success: false, message: 'Falha ao registar novo usuário Google.' };
            }
        }

        if (existingUser) {
            return {
                success: true,
                user: {
                    email,
                    name: existingUser.name,
                    hasPassword: existingUser.hasPassword,
                    google: existingUser.google
                }
            };
        }

        return { success: false, message: 'Dados insuficientes para login Google.' };
    }

    // LOGIN PADRÃO (com senha)
    if (password) {
        if (!existingUser) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        if (existingUser.google) {
            return { success: false, message: 'Conta registada via Google. Use o botão "Entrar com Google".' };
        }

        const result = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
        if (!result.rows[0] || !result.rows[0].password_hash) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        const isMatch = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isMatch) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        return {
            success: true,
            user: {
                email,
                name: existingUser.name,
                hasPassword: true,
                google: existingUser.google
            }
        };
    }

    return { success: false, message: 'Dados de login insuficientes.' };
}

// ────────────────────────────────
// Alterar senha (somente contas padrão)
// ────────────────────────────────
async function handleChangePassword(email, currentPassword, newPassword) {
    const existingUser = await checkUserExists(email);
    if (existingUser && existingUser.google) {
        return { success: false, message: 'Contas Google não podem alterar a senha. Faça a gestão da senha no Google.' };
    }

    const loginResult = await handleLogin(email, currentPassword, null);
    if (!loginResult.success) {
        return { success: false, message: 'Senha atual incorreta.' };
    }

    try {
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await query('UPDATE users SET password_hash = $1 WHERE email = $2', [newPasswordHash, email]);
        return { success: true, message: 'Senha alterada com sucesso.' };
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        return { success: false, message: 'Erro interno do servidor ao alterar a senha.' };
    }
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
