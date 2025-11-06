// api/send-email.js
const express = require('express');
const nodemailer = require('nodemailer');
// Adicione 'cors' para permitir que seu frontend (domínio diferente) chame a API.
const cors = require('cors'); 
require('dotenv').config(); 

const app = express();

// Configuração do CORS (MUITO IMPORTANTE para e-commerce)
// Substitua o placeholder pela URL REAL do seu site de e-commerce!
const allowedOrigins = [
    'http://localhost:8080', // Exemplo para desenvolvimento local
    'https://ecommerce.vercel.app', // **A URL do seu e-commerce**
    'https://ecommerce.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permite requisições sem 'origin' (como apps móveis, curl, etc.)
        if (!origin) return callback(null, true);
        // Permite a origem se estiver na lista
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política CORS para esta origem não permite acesso.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: 'POST', // Permite apenas o método POST
    credentials: true
}));

app.use(express.json()); 

// 1. Configurar o Transportador (Transporter) do Nodemailer
// As credenciais são carregadas de forma segura pelas Variáveis de Ambiente na Vercel
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    // Adiciona uma opção para o ambiente Vercel (opcional, mas recomendado)
    pool: true, 
    maxConnections: 10,
    maxMessages: 100 
});

// 2. Definir o Endpoint da API para Envio de E-mail
const sendEmail = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send({ message: 'Apenas método POST é permitido.' });
    }

    // Os dados esperados agora são 'to', 'subject' e 'html'
    const { to_email, to_name, subject, message_html } = req.body;
    
    // Validação básica dos dados
    if (!to_email || !subject || !message_html) {
        return res.status(400).send({ message: 'Campos obrigatórios: to_email, subject e message_html.' });
    }

    // 3. Estruturar a Mensagem
    const mailOptions = {
        from: `"${to_name || 'Cliente'}" <${process.env.EMAIL_FROM}>`, // Remetente com nome dinâmico
        to: to_email,         // Destinatário
        subject: subject, // Assunto
        html: message_html,       // Corpo do e-mail em HTML (o template)
        // Adicione aqui uma versão em texto puro caso queira (melhor prática de e-mail)
        text: `Olá ${to_name || 'Cliente'},\n\nSua compra foi um sucesso! Total: ${req.body.order_total}. Obrigado!`,
    };

    // 4. Enviar o E-mail
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('E-mail enviado:', info.messageId);
        return res.status(200).send({ 
            message: 'E-mail enviado com sucesso!', 
            messageId: info.messageId 
        });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        return res.status(500).send({ 
            message: 'Falha ao enviar e-mail.', 
            error: error.message 
        });
    }
};

// Exportar como função serverless para a Vercel
// A Vercel vai mapear a pasta /api para o endpoint /api
module.exports = sendEmail;