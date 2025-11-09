// api/users.js
// Endpoint Serverless para Autenticação e Cadastro de Usuários.
const { query } = require('./pg'); 
const bcrypt = require('bcryptjs');
const { parseBody } = require('./utils'); // Vamos criar este util em seguida

// Número de salt rounds para bcrypt. Mais alto = mais seguro, mas mais lento.
const SALT_ROUNDS = 10; 

// --- Funções de Ajuda (Backend) ---

async function checkUserExists(email) {
    const result = await query('SELECT email, password_hash, name, google FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
        return null; // Usuário não encontrado
    }
    const user = result.rows[0];
    return {
        email: user.email,
        name: user.name,
        // Retorna true se houver um hash de senha, senão null (para login Google sem senha)
        password: user.password_hash ? true : null, 
        google: user.google 
    };
}

// --- Funções Principais de Rota ---

async function handleRegister(name, email, password) {
    // 1. Verificar se já existe
    const existingUser = await checkUserExists(email);
    if (existingUser) {
        return { success: false, message: 'Este e-mail já está registrado.' };
    }

    // 2. Hash da senha
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 3. Inserir no DB
    try {
        await query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
            [name, email, passwordHash]
        );
        return { success: true, message: 'Usuário registrado com sucesso.' };
    } catch (error) {
        // Se houver qualquer outro erro de DB
        console.error('Erro ao registrar usuário:', error);
        return { success: false, message: 'Erro interno do servidor ao acessar o banco de dados.' };
    }
}

async function handleLogin(email, password, name) {
    // 1. Buscar usuário
    const result = await query('SELECT password_hash, name, google FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
        return { success: false, message: 'E-mail ou senha incorretos.' };
    }
    
    const user = result.rows[0];

    // 2. Login Padrão (com senha)
    if (password) {
        // Se o usuário não tem password_hash (é login Google), não pode usar login padrão
        if (!user.password_hash) {
            return { success: false, message: 'Use o botão "Entrar com Google" ou defina uma senha na sua conta.' };
        }
        
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return { success: false, message: 'E-mail ou senha incorretos.' };
        }

    // 3. Login Google (sem senha)
    } else if (name) {
        // Se é login Google, mas o usuário não existe, registramos ele.
        if (result.rows.length === 0) {
            await query(
                'INSERT INTO users (name, email, google, password_hash) VALUES ($1, $2, TRUE, NULL)',
                [name, email]
            );
        }
        // Se o usuário já existe e é Google, continua.
        // Se ele existe e tem senha, o login Google continua sendo válido.
    } else {
        return { success: false, message: 'Dados de login insuficientes.' };
    }
    
    // 4. Retorno de Sucesso
    return { 
        success: true, 
        user: { 
            email: email, 
            name: user.name, 
            password: user.password_hash ? true : null,
            google: user.google 
        } 
    };
}

async function handleChangePassword(email, currentPassword, newPassword) {
    // 1. Buscar usuário
    const result = await query('SELECT password_hash, google FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
        return { success: false, message: 'Usuário não encontrado.' };
    }
    const user = result.rows[0];

    // 2. Verificar senha atual (exceto se for Google e sem senha inicial)
    const isGoogleUserWithoutPassword = user.google && !user.password_hash;
    
    if (!isGoogleUserWithoutPassword) {
        // Para quem já tem senha, é preciso validar a senha atual
        if (!currentPassword || !user.password_hash) {
            return { success: false, message: 'Senha atual obrigatória para alteração.' };
        }
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return { success: false, message: 'Senha atual incorreta.' };
        }
    }

    // 3. Gerar novo hash e atualizar
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    try {
        await query(
            'UPDATE users SET password_hash = $1, google = FALSE WHERE email = $2',
            [newPasswordHash, email]
        );
        return { success: true, message: 'Senha atualizada com sucesso.' };
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        return { success: false, message: 'Erro interno ao atualizar a senha.' };
    }
}


// --- Handler Principal (Vercel) ---

module.exports = async (req, res) => {
    // Vercel/Next.js não exigem CORS OPTIONS por padrão, mas é bom tê-lo
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método não permitido.' });
    }

    const body = parseBody(req);
    if (!body || !body.action) {
        return res.status(400).json({ success: false, message: 'Ação de usuário não especificada.' });
    }
    
    // Verifica reCAPTCHA (Ignorado neste exemplo para focar no DB/Autenticação)

    try {
        let result;
        switch (body.action) {
            case 'register':
                if (!body.name || !body.email || !body.password) {
                    return res.status(400).json({ success: false, message: 'Dados de registro incompletos.' });
                }
                result = await handleRegister(body.name, body.email, body.password);
                break;
            case 'login':
                // O login lida com senha E Google (name presente)
                if (!body.email || (!body.password && !body.name)) {
                    return res.status(400).json({ success: false, message: 'Dados de login incompletos.' });
                }
                result = await handleLogin(body.email, body.password, body.name);
                break;
            case 'change_password':
                if (!body.email || !body.newPassword) {
                    return res.status(400).json({ success: false, message: 'Dados de alteração de senha incompletos.' });
                }
                result = await handleChangePassword(body.email, body.currentPassword, body.newPassword);
                break;
            default:
                return res.status(400).json({ success: false, message: 'Ação inválida.' });
        }

        // 409 Conflict é o status ideal se o registro falhar por e-mail duplicado
        if (!result.success && result.message.includes('e-mail já está registrado')) {
             return res.status(409).json(result);
        }

        return res.status(result.success ? 200 : 401).json(result);

    } catch (error) {
        console.error('Erro na requisição /api/users:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao acessar o banco de dados.' });
    }
};