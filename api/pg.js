// api/pg.js
// Módulo de conexão centralizado para o PostgreSQL/Neon
const { Pool } = require('pg');

// ⚠️ Variável de ambiente crucial! ⚠️
const POSTGRES_URL = process.env.POSTGRES_URL;

if (!POSTGRES_URL) {
    console.error("ERRO: A variável de ambiente POSTGRES_URL não está definida.");
    throw new Error("POSTGRES_URL é obrigatória para conexão com o banco de dados.");
}

// Configuração do pool de conexão.
// Em ambientes Serverless (como Vercel), é crucial fechar a conexão no final de cada requisição.
const pool = new Pool({
    connectionString: POSTGRES_URL,
    ssl: {
        // Neon exige SSL
        rejectUnauthorized: false
    }
});

/**
 * Função para executar queries no banco de dados.
 * @param {string} text - O texto da query (ex: 'SELECT * FROM users WHERE email = $1')
 * @param {Array<any>} params - Os parâmetros da query (ex: ['teste@teste.com'])
 * @returns {Promise<any>} O resultado da query.
 */
async function query(text, params) {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } catch (error) {
        console.error('ERRO na Query SQL:', error.message, 'Query:', text);
        // Lançamos o erro para ser pego pela função que chamou (ex: users.js ou purchases.js)
        throw error;
    } finally {
        // MUITO IMPORTANTE: Liberar o cliente de volta para o pool.
        client.release();
    }
}

// Inicialização e Criação de Tabelas
// Esta função cria as tabelas se elas não existirem (ideal para o primeiro deploy)
async function setupDatabase() {
    console.log('Verificando e configurando as tabelas...');
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                google BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS purchases (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(100) REFERENCES users(email),
                total NUMERIC(10, 2) NOT NULL,
                items JSONB NOT NULL,
                date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabelas "users" e "purchases" verificadas/criadas com sucesso.');
    } catch (error) {
        console.error('ERRO FATAL ao configurar o DB. Verifique POSTGRES_URL.', error.message);
        // O app não deve continuar se o setup falhar
        process.exit(1); 
    }
}

// Executar a configuração uma única vez na inicialização
setupDatabase();

module.exports = {
    query,
};