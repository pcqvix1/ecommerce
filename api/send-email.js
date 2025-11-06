// api/send-email.js
const { Resend } = require('resend');

// ----------------------------------------------------
// DOCUMENTAÇÃO: Variáveis de Ambiente e Segurança
// ----------------------------------------------------
// Inicializa o cliente Resend usando a chave de API do Vercel
// O Vercel injeta automaticamente esta variável no processo de execução.
const resend = new Resend(process.env.RESEND_API_KEY);

// O domínio/email de remetente DEVE ser um email verificado no Resend.
// Resend exige o formato "nome@dominio.com" ou "Nome <nome@dominio.com>"
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev'; 
const SENDER_NAME = 'Minha Loja Online';


// ----------------------------------------------------
// DOCUMENTAÇÃO: Funções Auxiliares (Template HTML)
// ----------------------------------------------------

/**
 * @description Constrói a tabela HTML com os itens do carrinho.
 * @param {Array<Object>} cart - O array de itens do carrinho.
 * @returns {string} O HTML do corpo da tabela.
 */
function buildItemsTable(cart) {
    // [CONTEÚDO DA FUNÇÃO ANTERIOR MANTIDO AQUI]
    return cart.map(item => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #333;">${item.name}</td>
            <td style="padding: 10px 0; text-align: center; color: #333;">${item.quantity}</td>
            <td style="padding: 10px 0; text-align: right; color: #333;">R$ ${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
    `).join('');
}

/**
 * @description Gera o template HTML completo do email.
 * @param {Object} user - Dados do utilizador (nome, email).
 * @param {Array<Object>} cart - Itens do carrinho.
 * @returns {string} O HTML completo do email.
 */
function buildEmailTemplate(user, cart) {
    const itemsTableBody = buildItemsTable(cart);
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);
    
    // O template HTML que você criou
    const fullMessageHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            
            <div style="background-color: #1a1a1a; color: white; padding: 25px; text-align: center; border-bottom: 5px solid #28a745;">
                <h1 style="margin: 0; font-size: 26px; font-weight: 600;">Minha Loja Online</h1>
                <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.8;">Confirmação de Pedido Recebido</p>
            </div>

            <div style="padding: 30px;">
                
                <h2 style="color: #1a1a1a; margin-top: 0; font-size: 20px;">Olá, <span style="color: #28a745; font-weight: 700;">${user.name}</span>!</h2>
                
                <p style="font-size: 15px; margin-bottom: 25px;">Sua compra foi um sucesso! Recebemos o seu pedido e estamos processando os itens.</p>

                <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #f9f9f9;">
                    <h3 style="color: #555; margin-top: 0; font-size: 16px; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px;">
                        Detalhes do Pedido
                    </h3>
                    
                    <table width="100%" style="border-collapse: collapse; margin-top: 15px;">
                        <thead>
                            <tr style="background-color: #e0e0e0;">
                                <th style="padding: 10px; text-align: left; color: #1a1a1a;">Produto</th>
                                <th style="padding: 10px; text-align: center; color: #1a1a1a;">Qtd</th>
                                <th style="padding: 10px; text-align: right; color: #1a1a1a;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsTableBody}
                        </tbody>
                    </table>
                    </div>
                
                <div style="margin-top: 30px; text-align: right;">
                    <p style="font-size: 18px; font-weight: 500; color: #1a1a1a; margin: 0;">TOTAL DA COMPRA:</p>
                    <p style="font-size: 30px; font-weight: bold; color: #28a745; margin: 5px 0 0 0;">R$ ${total}</p>
                </div>
                
                <p style="margin-top: 30px; font-size: 14px; color: #666; text-align: center;">
                    Você receberá um novo e-mail assim que o pedido for enviado.
                </p>
            </div>

            <div style="background-color: #f4f4f4; color: #999; padding: 15px; text-align: center; font-size: 12px; border-top: 1px solid #eee;">
                <p style="margin: 0;">Minha Loja Online | Onde a qualidade encontra você. <br>Em caso de dúvidas, entre em contato.</p>
            </div>
        </div>
    `;
    
    return fullMessageHtml;
}


// ----------------------------------------------------
// DOCUMENTAÇÃO: O Handler da Serverless Function (Vercel)
// ----------------------------------------------------

/**
 * @description O ponto de entrada principal para a Serverless Function do Vercel.
 * @param {Object} req - Objeto de requisição HTTP (Request).
 * @param {Object} res - Objeto de resposta HTTP (Response).
 */
module.exports = async (req, res) => {
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    try {
        const { user, cart } = req.body; 

        if (!user || !user.email || !cart || cart.length === 0) {
            return res.status(400).json({ error: 'Dados de usuário ou carrinho ausentes ou inválidos.' });
        }

        // 1. Geração do Template
        const emailHtml = buildEmailTemplate(user, cart);

        // 2. Montagem e Envio do Email usando RESEND
        
        // Formato necessário para o Resend: "Nome Remetente <email@dominio.com>"
        const fromEmail = `${SENDER_NAME} <${SENDER_EMAIL}>`;

        const { data, error } = await resend.emails.send({
            from: fromEmail, 
            to: [user.email], // Resend espera um array de emails para 'to'
            subject: `Confirmação de Pedido - Minha Loja Online`,
            html: emailHtml,
        });

        if (error) {
            console.error('ERRO RESEND API:', error);
            throw new Error(error.message || 'Erro ao comunicar com a API do Resend.');
        }

        // 3. Resposta de Sucesso
        res.status(200).json({ message: 'E-mail de confirmação enviado com sucesso!', resendId: data.id });

    } catch (error) {
        console.error('ERRO AO ENVIAR E-MAIL (BACKEND):', error.toString());
        
        // 4. Resposta de Erro
        res.status(500).json({ 
            error: 'Falha ao enviar o e-mail de confirmação.', 
            details: error.message 
        });
    }
};