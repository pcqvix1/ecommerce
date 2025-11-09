// api/users.js - Agora usando PostgreSQL (Neon)
const { query } = require('./pg');

module.exports = async (req, res) => {
    // CORS e validação de método...
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    if (req.method !== 'POST') { return res.status(405).json({ message: 'Método não permitido.' }); }

    let body;
    try { body = req.body; } catch (error) { body = null; }
    if (!body) { return res.status(400).json({ message: 'Corpo da requisição inválido.' }); }
    
    try {
        const { action, name, email, password, currentPassword, newPassword } = body;
        const lowerCaseEmail = email ? email.toLowerCase() : null; 

        if (action === 'register') {
            // --- REGISTRO (INSERT) ---
            if (!name || !lowerCaseEmail || !password || password.length < 6) {
                return res.status(400).json({ success: false, message: 'Dados incompletos ou senha < 6 caracteres.' });
            }
            
            // 1. Verificar se o e-mail já existe
            const existingUserRes = await query('SELECT id FROM users WHERE email = $1', [lowerCaseEmail]);
            if (existingUserRes.rows.length > 0) {
                return res.status(409).json({ success: false, message: 'E-mail já cadastrado.' });
            }

            // 2. Inserir novo usuário
            const insertQuery = 'INSERT INTO users (name, email, password, is_google) VALUES ($1, $2, $3, $4)';
            await query(insertQuery, [name, lowerCaseEmail, password, false]);
            
            return res.status(201).json({ success: true, message: 'Cadastro realizado com sucesso.' });

        } else if (action === 'login') {
            // --- LOGIN (SELECT) ---
            if (!lowerCaseEmail) {
                return res.status(400).json({ success: false, message: 'E-mail é obrigatório.' });
            }
            
            // 1. Busca o usuário
            const userRes = await query('SELECT name, email, password, is_google FROM users WHERE email = $1', [lowerCaseEmail]);
            let user = userRes.rows[0];

            // 2. Lógica de Login com senha tradicional
            if (password) {
                if (user && user.password === password) {
                    const userSession = { name: user.name, email: user.email, google: user.is_google, password: user.password ? true : false }; 
                    return res.status(200).json({ success: true, user: userSession });
                } else {
                    return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
                }
            } 
            
            // 3. Lógica de Login Google (Verifica/Cria)
            if (!password) { 
                 if (user) {
                    // Se existe, garante que está marcado como Google e retorna
                    await query('UPDATE users SET is_google = TRUE WHERE email = $1', [lowerCaseEmail]);
                    user.is_google = true;
                    const userSession = { name: user.name, email: user.email, google: user.is_google, password: user.password ? true : false };
                    return res.status(200).json({ success: true, user: userSession });
                 } else {
                    // Cria um novo utilizador Google (sem senha)
                    const insertQuery = 'INSERT INTO users (name, email, is_google) VALUES ($1, $2, $3)';
                    await query(insertQuery, [name, lowerCaseEmail, true]);
                    const userSession = { name, email: lowerCaseEmail, google: true, password: false };
                    return res.status(201).json({ success: true, user: userSession });
                 }
            }

        } else if (action === 'change_password') {
            // --- ALTERAÇÃO DE SENHA (UPDATE) ---
            if (!lowerCaseEmail || newPassword.length < 6) {
                return res.status(400).json({ success: false, message: 'Dados incompletos ou nova senha < 6 caracteres.' });
            }

            const userRes = await query('SELECT password, is_google FROM users WHERE email = $1', [lowerCaseEmail]);
            const user = userRes.rows[0];
            if (!user) {
                return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
            }
            
            // Validação de senha atual
            if (user.password !== null && user.password !== currentPassword) {
                return res.status(401).json({ success: false, message: 'Senha atual incorreta.' });
            }
            
            // Atualiza a senha no banco de dados
            await query('UPDATE users SET password = $1 WHERE email = $2', [newPassword, lowerCaseEmail]);

            return res.status(200).json({ success: true, message: 'Senha alterada/definida com sucesso.' });

        } else {
            return res.status(400).json({ success: false, message: 'Ação desconhecida.' });
        }

    } catch (error) {
        console.error('ERRO NO PG/API USERS:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao acessar o banco de dados.' });
    }
};