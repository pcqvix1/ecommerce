// api/pg.js - Gerenciador de Conexão PostgreSQL (Neon)

const { Pool } = require('pg');

// URI de conexão lida da variável de ambiente POSTGRES_URL
const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
    throw new Error('A variável de ambiente POSTGRES_URL não está definida!');
}

// O Pool é crucial em ambientes Serverless para reutilizar conexões.
// Ele evita a criação de uma nova conexão para cada requisição.
const pool = new Pool({
    connectionString,
    // Configurações de pool otimizadas para Neon/Serverless
    max: 20, // Número máximo de clientes no pool
    idleTimeoutMillis: 30000, // Clientes inativos fecham após 30 segundos
    connectionTimeoutMillis: 2000, // Tempo de espera para obter uma conexão
});

// Listener para logar erros de conexão inativas
pool.on('error', (err, client) => {
    console.error('Erro inesperado em cliente inativo do pool', err);
    // Em produção, você pode querer implementar um relógio de monitoramento mais robusto
});

/**
 * Executa uma query SQL.
 * @param {string} text - A query SQL com placeholders ($1, $2, ...)
 * @param {Array<any>} params - Os parâmetros para os placeholders.
 * @returns {Promise<import('pg').QueryResult>} O resultado da query.
 */
async function query(text, params) {
    // Tenta pegar um cliente do pool
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        // MUITO IMPORTANTE: Libera o cliente de volta para o pool
        client.release();
    }
}

module.exports = {
    query,
};