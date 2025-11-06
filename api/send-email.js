// api/send-email.js
// Handler serverless leve e robusto (sem Express). Projetado para ambientes como Vercel.
const nodemailer = require('nodemailer');

// Lista de variáveis de ambiente necessárias
const REQUIRED_ENVS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];

function missingEnv() {
    return REQUIRED_ENVS.filter(k => !process.env[k] || process.env[k].trim() === '');
}

// Util: parse seguro do body (algumas plataformas entregam string)
function parseBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch (e) { return null; }
    }
    return req.body;
}

const sendEmail = async (req, res) => {
    // Suporta OPTIONS para preflight CORS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    // Apenas POST para o envio
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ message: 'Apenas método POST é permitido.' });
    }

    // Verificar variáveis de ambiente obrigatórias
    const missing = missingEnv();
    if (missing.length > 0) {
        console.error('Env vars ausentes:', missing);
        return res.status(500).json({ message: 'Configuração do servidor incompleta.', missing });
    }

    // Cabeçalhos CORS básicos (ajuste para restringir origem em produção se quiser)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    const body = parseBody(req);
    if (body === null) {
        return res.status(400).json({ message: 'Corpo inválido: JSON malformado.' });
    }

    const { to_email, to_name, subject, message_html, order_total } = body;
    if (!to_email || !subject || !message_html) {
        return res.status(400).json({ message: 'Campos obrigatórios: to_email, subject e message_html.' });
    }

    // Criar o transportador dinamicamente — evita falhar no import caso envs mudem.
    let transporter;
    try {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            pool: true,
        });
    } catch (err) {
        console.error('Erro ao criar transportador:', err);
        return res.status(500).json({ message: 'Erro ao inicializar o serviço de e-mail.' });
    }

    const mailOptions = {
        from: `"${to_name || 'Minha Loja Online'}" <${process.env.EMAIL_FROM}>`,
        to: to_email,
        subject,
        html: message_html,
        text: `Olá ${to_name || 'Cliente'},\n\nSua compra foi confirmada. Total: ${order_total || ''}.`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('E-mail enviado:', info && info.messageId);
        return res.status(200).json({ message: 'E-mail enviado com sucesso!', messageId: info && info.messageId });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        // Não expor segredos — retorna somente mensagem amigável e, se houver, o erro.message
        return res.status(500).json({ message: 'Falha ao enviar e-mail.', error: error && error.message });
    }
};

module.exports = sendEmail;