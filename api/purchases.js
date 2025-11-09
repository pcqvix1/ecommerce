// api/purchases.js - Agora usando PostgreSQL (Neon)
const { query } = require('./pg');

module.exports = async (req, res) => {
    // CORS e validação de método...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    
    try {
        if (req.method === 'GET') {
            // --- LEITURA (SELECT) ---
            const userEmail = req.query.email ? req.query.email.toLowerCase() : null;
            if (!userEmail) {
                return res.status(400).json({ message: 'E-mail do usuário é obrigatório.' });
            }
            
            // Busca todas as compras, ordenadas por data (coluna `purchased_at`)
            const userPurchasesRes = await query(
                'SELECT id, total, items, purchased_at FROM purchases WHERE user_email = $1 ORDER BY purchased_at DESC', 
                [userEmail]
            );

            // A coluna `items` é um JSONB, o driver PG o converte automaticamente em Array/Objeto JS.
            // O frontend espera `date`, vamos mapear `purchased_at` para `date`
            const purchases = userPurchasesRes.rows.map(row => ({
                id: row.id,
                total: parseFloat(row.total),
                items: row.items,
                // Formatação simples da data para o frontend
                date: new Date(row.purchased_at).toLocaleString(), 
            }));

            return res.status(200).json({ success: true, purchases: purchases });

        } else if (req.method === 'POST') {
            // --- ESCRITA (INSERT) ---
            let body;
            try { body = req.body; } catch (error) { body = null; }
            if (!body) { return res.status(400).json({ message: 'Corpo da requisição inválido.' }); }

            const { userEmail, purchaseData } = body;
            const lowerCaseEmail = userEmail ? userEmail.toLowerCase() : null;

            if (!lowerCaseEmail || !purchaseData || !purchaseData.items || typeof purchaseData.total !== 'number') {
                return res.status(400).json({ message: 'Dados da compra incompletos ou inválidos.' });
            }
            
            // Os dados do carrinho (items) são passados como JSON e inseridos no campo JSONB do PG
            const insertQuery = 'INSERT INTO purchases (user_email, total, items) VALUES ($1, $2, $3) RETURNING id';

            const result = await query(insertQuery, [
                lowerCaseEmail, 
                purchaseData.total, 
                purchaseData.items // O driver pg fará a conversão para JSON/JSONB
            ]);

            return res.status(201).json({ success: true, message: 'Compra salva com sucesso.', purchaseId: result.rows[0].id });

        } else {
            return res.status(405).json({ message: 'Método não permitido.' });
        }

    } catch (error) {
        console.error('ERRO NO PG/API PURCHASES:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao acessar o banco de dados.' });
    }
};