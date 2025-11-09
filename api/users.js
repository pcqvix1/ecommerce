// api/users.js
const { query } = require('./pg'); 
const bcrypt = require('bcryptjs'); 
const { parseBody } = require('./utils'); 

// Constantes
const SALT_ROUNDS = 10; 

// Handler para verificar se o usuário existe, usado tanto por login quanto registro
async function checkUserExists(email) {
    const result = await query('SELECT email, password_hash, name, google FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
        return null; // Usuário não existe
    }
    const user = result.rows[0];
    return {
        email: user.email,
        name: user.name,
        // Retorna true se houver hash de senha (login padrão), null caso contrário (login Google)
        hasPassword: user.password_hash ? true : null, 
        google: user.google 
    };
}

// Handler de Registro (Para Senha Padrão)
async function handleRegister(name, email, password) {
    const existingUser = await checkUserExists(email);

    if (existingUser) {
        // Se já for uma conta Google, não permite registro com senha, forçando login Google.
        if (existingUser.google) {
             return { success: false, message: 'Este e-mail está registado com o Google. Use o botão "Entrar com Google".' };
        }
        return { success: false, message: 'Este e-mail já está registado.' };
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
        await query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
            [name, email, passwordHash]
        );
        return { success: true, message: 'Usuário registado com sucesso.' };
    } catch (error) {
        console.error('Erro ao registar usuário padrão:', error);
        return { success: false, message: 'Erro interno ao registar o usuário.' };
    }
}

// Handler de Login (Lida com Login Padrão e Login Google)
async function handleLogin(email, password, name) {
    const existingUser = await checkUserExists(email);

    // 1. Se o usuário NÃO EXISTE
    if (!existingUser) {
        // Se for um LOGIN GOOGLE (tem 'name' mas não tem 'password'), registra.
        if (name && !password) {
             try {
                // Insere com google=TRUE e password_hash=NULL
                await query(
                   'INSERT INTO users (name, email, google, password_hash) VALUES ($1, $2, TRUE, NULL)',
                   [name, email]
               );
               // Login automático após o registro
               return { 
                   success: true, 
                   user: { email: email, name: name, hasPassword: null, google: true } 
               };
           } catch (error) {
               console.error('Erro ao registar novo usuário Google:', error);
               return { success: false, message: 'Falha ao registar novo usuário Google.' };
           }
        }
        // Se não existe e não é login Google, falha.
        return { success: false, message: 'E-mail ou senha incorretos.' };
    }

    // 2. Se o usuário EXISTE

    // Se é uma tentativa de LOGIN GOOGLE (não enviou senha, mas enviou nome)
    if (name && !password) {
        // O login é válido, não precisamos verificar a senha.
        // Se o usuário existir, o Google já o autenticou.
        return { 
            success: true, 
            user: { 
                email: email, 
                name: existingUser.name, 
                hasPassword: existingUser.hasPassword, 
                google: existingUser.google 
            } 
        };
    }
    
    // Se for uma tentativa de LOGIN PADRÃO (enviou senha)
    if (password) {
         // O usuário deve ter uma senha registada no DB
        if (!existingUser.hasPassword) {
            return { success: false, message: 'Conta registada via Google. Use o botão "Entrar com Google".' };
        }
        
        // Compara a senha
        const result = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
        const isMatch = await bcrypt.compare(password, result.rows[0].password_hash,);
        
        if (!isMatch) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }
        
        return { 
            success: true, 
            user: { 
                email: email, 
                name: existingUser.name, 
                hasPassword: true, 
                google: existingUser.google 
            } 
        };
    }

    // Se a requisição chegou aqui, faltam dados
    return { success: false, message: 'Dados de login insuficientes.' };
}

// Handler para alterar senha
async function handleChangePassword(email, currentPassword, newPassword) {
    // ... (Manter a lógica de alteração de senha) ...
    // NOTE: Se o usuário logou com Google, não deve ser permitido alterar a senha
    const existingUser = await checkUserExists(email);
    if (existingUser && existingUser.google) {
        return { success: false, message: 'Contas Google não podem alterar a senha. Faça a gestão da senha no Google.' };
    }

    // 1. Verificar senha atual
    const loginResult = await handleLogin(email, currentPassword, null);
    if (!loginResult.success) {
        return { success: false, message: 'Senha atual incorreta.' };
    }

    // 2. Criar novo hash e atualizar
    try {
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await query(
            'UPDATE users SET password_hash = $1 WHERE email = $2',
            [newPasswordHash, email]
        );
        return { success: true, message: 'Senha alterada com sucesso.' };
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        return { success: false, message: 'Erro interno do servidor ao alterar a senha.' };
    }
}

// --- Handler Principal (Vercel) ---

module.exports = async (req, res) => {
    // Adiciona CORS para permitir chamadas do frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).end();
    }
    
    const body = parseBody(req); 
    if (!body || !body.action) {
        return res.status(400).json({ success: false, message: 'Ação de usuário não especificada.' });
    }
    
    try {
        let result;
        const { action, email, password, name, newPassword } = body;

        // Validação básica
        if (!email) {
            return res.status(400).json({ success: false, message: 'O e-mail é obrigatório.' });
        }
        
        switch (action) {
            case 'register':
                if (!password || !name) return res.status(400).json({ success: false, message: 'Nome e senha são obrigatórios para o registo padrão.' });
                result = await handleRegister(name, email, password);
                break;

            case 'login':
                // Nota: O Login Google envia (email, name, password: null)
                // O Login Padrão envia (email, password)
                if (!password && !name) return res.status(400).json({ success: false, message: 'Dados de login insuficientes.' });
                result = await handleLogin(email, password, name);
                break;

            case 'changePassword':
                if (!password || !newPassword) return res.status(400).json({ success: false, message: 'Senha atual e nova senha são obrigatórias.' });
                result = await handleChangePassword(email, password, newPassword);
                break;

            default:
                return res.status(400).json({ success: false, message: 'Ação inválida.' });
        }

        // Se o login falhar, retorna 401 Unauthorized
        // Se o registro falhar (usuário existente), retorna 409 Conflict (ou 400 Bad Request)
        if (!result.success && action === 'login') {
            return res.status(401).json(result); 
        }
        if (!result.success && action === 'register') {
            return res.status(409).json(result); 
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Erro geral na requisição /api/users:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao processar o usuário.' });
    }
};