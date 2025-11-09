// api/purchases.js
// Endpoint Serverless para Salvar e Listar Compras (DB).
const { query } = require('./pg');
const { parseBody } = require('./utils'); // Vamos criar este util em seguida

// Handler para salvar a compra (POST)
async function handlePostPurchase(userEmail, purchaseData) {
    if (!userEmail || !purchaseData || !purchaseData.total || !purchaseData.items) {
        return { success: false, message: 'Dados de compra incompletos.' };
    }

    try {
        // Converte o objeto de itens do carrinho em string JSON para o tipo JSONB no PostgreSQL
        const itemsJson = JSON.stringify(purchaseData.items);
        
        const result = await query(
            'INSERT INTO purchases (user_email, total, items) VALUES ($1, $2, $3) RETURNING id',
            [userEmail, purchaseData.total, itemsJson]
        );

        return { success: true, message: 'Compra salva com sucesso!', purchaseId: result.rows[0].id };
    } catch (error) {
        console.error('Erro ao salvar compra:', error);
        return { success: false, message: 'Erro interno do servidor ao salvar compra.' };
    }
}

// Handler para listar o histórico de compras (GET)
async function handleGetPurchases(userEmail) {
    if (!userEmail) {
        return { success: false, message: 'E-mail do usuário não fornecido.' };
    }

    try {
        const result = await query(
            'SELECT id, total, items, date FROM purchases WHERE user_email = $1 ORDER BY date DESC',
            [userEmail]
        );
        
        return { success: true, purchases: result.rows };
    } catch (error) {
        console.error('Erro ao listar compras:', error);
        return { success: false, message: 'Erro interno do servidor ao buscar histórico.' };
    }
}


// --- Handler Principal (Vercel) ---

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        let result;
        
        if (req.method === 'POST') {
            const body = parseBody(req);
            result = await handlePostPurchase(body.userEmail, body.purchaseData);
        } else if (req.method === 'GET') {
            const userEmail = req.query.email;
            result = await handleGetPurchases(userEmail);
        } else {
            return res.status(405).json({ success: false, message: 'Método não permitido.' });
        }

        return res.status(result.success ? 200 : 400).json(result);

    } catch (error) {
        console.error('Erro na requisição /api/purchases:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao acessar o banco de dados.' });
    }
};