const puppeteer = require('puppeteer');
const {
  novaPagina,
  abrirApp,
  irParaNovaTransacao,
  preencherFormulario,
  salvar,
  obterSaldoExibido,
  contarTransacoes,
  lerTransacoesStorage,
  excluirComToqueLongo,
} = require('./helpers');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const HEADLESS = process.env.HEADLESS !== 'false';

// WINDOW_POSITION=1920,0 abre a janela do Chrome na 2ª tela (ex.: monitor HDMI
// que começa em x=1920 no layout do xrandr). Só tem efeito com HEADLESS=false.
const args = ['--no-sandbox', '--disable-setuid-sandbox'];
if (process.env.WINDOW_POSITION) {
  args.push(`--window-position=${process.env.WINDOW_POSITION}`);
}

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args,
  });
});

afterAll(async () => {
  if (browser) await browser.close();
});

beforeEach(async () => {
  page = await novaPagina(browser, BASE_URL);
});

afterEach(async () => {
  if (page) await page.close();
});

describe('Passo 8.1 — Roteiro de teste', () => {
  test('1) Abre o app na tela vazia (sem transações)', async () => {
    await abrirApp(page);

    const texto = await page.evaluate(() => document.body.innerText || '');
    expect(texto).toMatch(/Nenhuma transação ainda/i);
    expect(texto).toMatch(/Toque em "Nova Transação"/i);

    expect(await contarTransacoes(page)).toBe(0);
  });

  test('2-5) Adiciona receita (Salário 3200) e despesa (Supermercado 150); saldo = 3050', async () => {
    await abrirApp(page);

    await irParaNovaTransacao(page);
    await preencherFormulario(page, {
      tipo: 'receita',
      descricao: 'Salário',
      valor: '3200',
      categoria: 'salario',
    });
    await salvar(page);

    let texto = await page.evaluate(() => document.body.innerText || '');
    expect(texto).toContain('Salário');

    await irParaNovaTransacao(page);
    await preencherFormulario(page, {
      tipo: 'despesa',
      descricao: 'Supermercado',
      valor: '150',
      categoria: 'alimentacao',
    });
    await salvar(page);

    texto = await page.evaluate(() => document.body.innerText || '');
    expect(texto).toContain('Salário');
    expect(texto).toContain('Supermercado');

    const saldo = await obterSaldoExibido(page);
    expect(saldo).toBeCloseTo(3050, 2);

    const transacoes = await lerTransacoesStorage(page);
    expect(transacoes).toHaveLength(2);
    expect(transacoes.some((t) => t.descricao === 'Salário' && t.tipo === 'receita' && t.valor === 3200)).toBe(true);
    expect(transacoes.some((t) => t.descricao === 'Supermercado' && t.tipo === 'despesa' && t.valor === 150)).toBe(true);
  });

  test('6) Transações persistem após fechar/reabrir o app (AsyncStorage)', async () => {
    await abrirApp(page);

    await irParaNovaTransacao(page);
    await preencherFormulario(page, {
      tipo: 'receita',
      descricao: 'Persistência',
      valor: '500',
      categoria: 'outros',
    });
    await salvar(page);

    expect(await contarTransacoes(page)).toBe(1);

    await page.reload({ waitUntil: 'networkidle2' });
    await abrirApp(page);

    const texto = await page.evaluate(() => document.body.innerText || '');
    expect(texto).toContain('Persistência');

    const transacoes = await lerTransacoesStorage(page);
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].descricao).toBe('Persistência');
  });

  // Observação: no Expo Web, Alert.alert do react-native-web é um no-op,
  // então o fluxo "long press -> dialog -> confirmar" não pode ser executado
  // pelo navegador. O helper excluirComToqueLongo verifica que onLongPress
  // está ligado e dispara removerTransacao do contexto (equivalente a
  // confirmar "Excluir" no celular).
  test('7-8) Item tem onLongPress ligado; remover via contexto esvazia a lista e o storage', async () => {
    await abrirApp(page);

    await irParaNovaTransacao(page);
    await preencherFormulario(page, {
      tipo: 'despesa',
      descricao: 'Para Excluir',
      valor: '99',
      categoria: 'outros',
    });
    await salvar(page);

    expect(await contarTransacoes(page)).toBe(1);

    const resultado = await excluirComToqueLongo(page, 'Para Excluir');
    expect(resultado.ok).toBe(true);

    await page.waitForFunction(
      () => (document.body.innerText || '').includes('Nenhuma transação ainda'),
      { timeout: 10000 }
    );

    expect(await contarTransacoes(page)).toBe(0);
  });
});
