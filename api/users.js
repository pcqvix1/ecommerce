// api/users.js
const { query } = require('./pg');
const bcrypt = require('bcryptjs');
const { parseBody } = require('./utils');
const util = require('util');

const SALT_ROUNDS = 10;

// ────────────────────────────────
// Função auxiliar: busca usuário
// ────────────────────────────────
async function checkUserExists(email) {
    const result = await query(
        'SELECT email, password_hash, name, COALESCE(google, FALSE) AS google FROM users WHERE email = $1',
        [email]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    return {
        email: user.email,
        name: user.name,
        hasPassword: user.password_hash ? true : false,
        google: !!user.google
    };
}

// ────────────────────────────────
// Registro padrão (senha)
// ────────────────────────────────
async function handleRegister(name, email, password) {
    const existingUser = await checkUserExists(email);

    if (existingUser) {
        if (existingUser.google) {
            return {
                success: false,
                message: 'Este e-mail está registado com o Google. Use o botão "Entrar com Google".'
            };
        }
        return { success: false, message: 'Este e-mail já está registado.' };
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await query('INSERT INTO users (name, email, password_hash, google) VALUES ($1, $2, $3, FALSE)', [
            name,
            email,
            passwordHash
        ]);
        return { success: true, message: 'Usuário registado com sucesso.' };
    } catch (error) {
        console.error('Erro ao registar usuário padrão:', error);
        return { success: false, message: 'Erro interno ao registar o usuário.' };
    }
}

// ────────────────────────────────
// Login (Google + padrão)
// ────────────────────────────────
async function handleLogin(email, password, name) {
    console.log('\n----- handleLogin -----');
    console.log(`Email: ${email}`);
    console.log(`Password type: ${typeof password} | Value: ${password ? '[REDACTED]' : password}`);
    console.log(`Name: ${name}`);

    const existingUser = await checkUserExists(email);
    console.log('Existing user from DB:', existingUser);

    // 🔹 LOGIN GOOGLE (sem senha ou senha vazia)
    if (password === undefined || password === null || password === '') {
        try {
            if (!existingUser) {
                const displayName = name || email.split('@')[0];
                console.log('Criando nova conta Google para', email);

                await query(
                    'INSERT INTO users (name, email, google, password_hash) VALUES ($1, $2, TRUE, NULL)',
                    [displayName, email]
                );

                return {
                    success: true,
                    user: { email, name: displayName, hasPassword: false, google: true }
                };
            }

            // Se já existir, garantir que esteja marcada como conta Google
            if (!existingUser.google) {
                console.log('Atualizando usuário existente para google=TRUE:', email);
                await query('UPDATE users SET google = TRUE WHERE email = $1', [email]);
            }

            return {
                success: true,
                user: {
                    email,
                    name: existingUser.name,
                    hasPassword: existingUser.hasPassword,
                    google: true
                }
            };
        } catch (error) {
            console.error('Erro ao processar login Google:', error);
            return { success: false, message: 'Erro interno ao processar login com Google.' };
        }
    }

    // 🔹 LOGIN NORMAL (com senha)
    try {
        if (!existingUser) {
            console.log('Usuário não encontrado.');
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        if (existingUser.google) {
            console.log('Conta é Google, mas tentou login com senha.');
            return {
                success: false,
                message: 'Esta conta foi criada com o Google. Use o botão "Entrar com Google".'
            };
        }

        const result = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
        const hash = result.rows[0]?.password_hash;
        if (!hash) {
            console.log('Senha não encontrada no banco.');
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        const isMatch = await bcrypt.compare(password, hash);
        if (!isMatch) {
            console.log('Senha incorreta.');
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

        console.log('Login padrão bem-sucedido.');
        return {
            success: true,
            user: { email, name: existingUser.name, hasPassword: true, google: false }
        };
    } catch (err) {
        console.error('Erro no login padrão:', err);
        return { success: false, message: 'Erro interno ao processar login.' };
    }
}

// ────────────────────────────────
// Alterar senha (apenas padrão)
// ────────────────────────────────
async function handleChangePassword(email, currentPassword, newPassword) {
    const existingUser = await checkUserExists(email);
    if (existingUser && existingUser.google) {
        return {
            success: false,
            message: 'Contas Google não podem alterar a senha. Faça a gestão da senha no Google.'
        };
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

    console.log('\n========= /api/users =========');
    console.log('Método:', req.method);
    console.log('Corpo recebido:', util.inspect(body, { depth: 3, maxArrayLength: 10 }));

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
                    return res
                        .status(400)
                        .json({ success: false, message: 'Nome e senha são obrigatórios para o registo padrão.' });
                result = await handleRegister(name, email, password);
                break;

            case 'login':
                result = await handleLogin(email, password, name);
                break;

            case 'changePassword':
                if (!password || !newPassword)
                    return res
                        .status(400)
                        .json({ success: false, message: 'Senha atual e nova senha são obrigatórias.' });
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
        return res
            .status(500)
            .json({ success: false, message: 'Erro interno do servidor ao processar o usuário.' });
    }
};
