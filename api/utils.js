// api/utils.js
// Funções utilitárias

/**
 * Parses o corpo da requisição (que pode vir como string JSON em alguns ambientes).
 * @param {object} req - O objeto de requisição da Serverless Function.
 * @returns {object | null} O corpo parseado ou null em caso de falha.
 */
function parseBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch (e) { return null; }
    }
    // Em Vercel/Next.js, o body já vem parseado.
    return req.body;
}

module.exports = {
    parseBody
};