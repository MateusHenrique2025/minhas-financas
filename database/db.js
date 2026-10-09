// database/db.js
import * as SQLite from 'expo-sqlite';

let db;

// Cria a tabela se ainda não existir
export async function inicializarBanco() {
  db = await SQLite.openDatabaseAsync('minhasfinancas.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id        TEXT PRIMARY KEY,
      descricao TEXT NOT NULL,
      valor     REAL NOT NULL,
      tipo      TEXT NOT NULL,
      categoria TEXT NOT NULL,
      data      TEXT NOT NULL
    );
  `);
}

// Retorna todas as transações, mais recentes primeiro
export async function buscarTodasTransacoes() {
  return await db.getAllAsync(
    'SELECT * FROM transacoes ORDER BY rowid DESC'
  );
}

// Insere uma nova transação
export async function inserirTransacao(t) {
  await db.runAsync(
    'INSERT INTO transacoes (id, descricao, valor, tipo, categoria, data) VALUES (?, ?, ?, ?, ?, ?)',
    [t.id, t.descricao, t.valor, t.tipo, t.categoria, t.data]
  );
}

// Remove uma transação pelo id
export async function excluirTransacao(id) {
  await db.runAsync('DELETE FROM transacoes WHERE id = ?', [id]);
}