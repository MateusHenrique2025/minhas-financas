const TIMEOUT = 30000;

const LABEL_CATEGORIA = {
  alimentacao: 'Alimentação',
  transporte: 'Transporte',
  saude: 'Saúde',
  lazer: 'Lazer',
  moradia: 'Moradia',
  salario: 'Salário',
  outros: 'Outros',
};

async function novaPagina(browser, baseUrl) {
  const page = await browser.newPage();
  await page.setViewport({
    width: 414,
    height: 896,
    isMobile: true,
    hasTouch: true,
  });
  page.setDefaultTimeout(TIMEOUT);

  // RN-web roteia Alert.alert(..., [cancelar, destrutivo]) por window.confirm:
  // true -> chama onPress do último botão; false -> primeiro. Forçamos true
  // para que o "Excluir" seja sempre acionado durante os testes.
  //
  // O app persiste as transações via expo-sqlite (não mais AsyncStorage/localStorage),
  // então os testes não têm uma chave de storage para ler/limpar diretamente.
  // window.__obterContextoTransacoes expõe o value do TransacoesContext (achado via
  // fiber do React) para os testes lerem e limparem o estado real.
  await page.evaluateOnNewDocument(() => {
    window.confirm = () => true;
    window.alert = () => undefined;

    window.__obterContextoTransacoes = function () {
      function fiberDe(node) {
        const k = Object.keys(node).find(
          (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );
        return k ? node[k] : null;
      }
      const todos = document.querySelectorAll('*');
      for (const el of todos) {
        let fiber = fiberDe(el);
        while (fiber) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          const value = props && props.value;
          if (
            value &&
            typeof value.removerTransacao === 'function' &&
            typeof value.adicionarTransacao === 'function' &&
            Array.isArray(value.transacoes)
          ) {
            return value;
          }
          fiber = fiber.return;
        }
      }
      return null;
    };
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await abrirApp(page);
  await limparTransacoes(page);
  return page;
}

// Remove todas as transações existentes via o próprio contexto da aplicação
// (SQLite real), garantindo que cada teste comece de um estado vazio.
async function limparTransacoes(page) {
  await page.evaluate(async () => {
    const contexto = window.__obterContextoTransacoes();
    if (!contexto) return;
    for (const t of contexto.transacoes.slice()) {
      await contexto.removerTransacao(t.id);
    }
  });
  await page.waitForFunction(
    () => (document.body.innerText || '').includes('Nenhuma transação ainda'),
    { timeout: TIMEOUT }
  );
}

async function dispensarBoasVindas(page) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const jaDashboard = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return (
        t.includes('Carregando suas finanças') ||
        t.includes('Transações Recentes') ||
        t.includes('Nenhuma transação')
      );
    });
    if (jaDashboard) return;

    const clicou = await page.evaluate(() => {
      const ctas = ['Começar', 'Continuar', 'Vamos lá', 'Entrar', 'Avançar', 'Próximo', 'Iniciar', 'OK'];
      // TouchableOpacity no react-native-web não expõe role="button" nem <button>;
      // vira <div> puro. Então, além do seletor semântico, caímos para qualquer
      // elemento folha cujo texto bata com um dos CTAs.
      const candidatos = Array.from(document.querySelectorAll('[role="button"], button, [tabindex]'));
      const visiveis = candidatos.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const cta of ctas) {
        const alvo = visiveis.find((el) => (el.innerText || '').includes(cta));
        if (alvo) { alvo.click(); return true; }
      }

      const folhas = Array.from(document.querySelectorAll('*')).filter((el) => el.children.length === 0);
      for (const cta of ctas) {
        const alvo = folhas.find((el) => (el.textContent || '').trim() === cta);
        if (alvo) { alvo.click(); return true; }
      }

      const ultimo = visiveis[visiveis.length - 1];
      if (ultimo) { ultimo.click(); return true; }
      return false;
    });

    if (!clicou) break;
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function abrirApp(page) {
  await page.waitForFunction(() => (document.body.innerText || '').length > 0, {
    timeout: TIMEOUT,
  });
  await dispensarBoasVindas(page);
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Carregando suas finanças'),
    { timeout: TIMEOUT }
  );
  await page.waitForFunction(
    () => {
      const t = document.body.innerText || '';
      return t.includes('Transações Recentes') || t.includes('Nenhuma transação');
    },
    { timeout: TIMEOUT }
  );
}

async function acharElementoPorTexto(page, texto, { exato = false } = {}) {
  return page.evaluateHandle(
    (search, exatoFlag) => {
      const todos = Array.from(document.querySelectorAll('[role="button"], button, [tabindex]'));
      const candidatos = todos.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const matchTexto = (el) => {
        const t = (el.innerText || '').trim();
        return exatoFlag ? t === search : t.includes(search);
      };
      const direto = candidatos.find(matchTexto);
      if (direto) return direto;
      const all = Array.from(document.querySelectorAll('*'));
      return all.find(matchTexto) || null;
    },
    texto,
    exato
  );
}

async function clicarPorTexto(page, texto, opcoes = {}) {
  const handle = await acharElementoPorTexto(page, texto, opcoes);
  const el = handle.asElement();
  if (!el) {
    throw new Error(`Elemento com texto "${texto}" não encontrado`);
  }
  await el.click();
  return el;
}

async function irParaNovaTransacao(page) {
  await clicarPorTexto(page, 'Nova Transação');
  await page.waitForFunction(
    () => {
      const t = document.body.innerText || '';
      return t.includes('Salvar Transação') && t.includes('Descrição');
    },
    { timeout: TIMEOUT }
  );
}

async function preencherFormulario(page, { tipo, descricao, valor, categoria }) {
  const labelTipo = tipo === 'receita' ? 'Receita' : 'Despesa';
  await clicarPorTexto(page, labelTipo, { exato: true });

  const inputs = await page.$$('input');
  if (inputs.length < 2) {
    throw new Error(`Esperava 2 inputs no formulário, encontrei ${inputs.length}`);
  }
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(descricao, { delay: 10 });
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(valor, { delay: 10 });

  const labelCategoria = LABEL_CATEGORIA[categoria];
  if (!labelCategoria) {
    throw new Error(`Categoria desconhecida: ${categoria}`);
  }
  await clicarPorTexto(page, labelCategoria, { exato: true });
}

async function salvar(page) {
  // Não dá para esperar por um texto como "Transações Recentes" para saber que
  // o salvamento terminou: o bottom-tabs mantém todas as abas montadas e visíveis
  // para document.body.innerText ao mesmo tempo (o header da Dashboard aparece
  // mesmo com a aba "Nova Transação" em foco), então esse texto já está presente
  // ANTES de clicar em Salvar — a espera nunca falharia e o teste seguiria antes do
  // insert assíncrono no SQLite (adicionarTransacao) terminar. Em vez disso,
  // esperamos a lista real do contexto crescer.
  const antes = await page.evaluate(() => {
    const contexto = window.__obterContextoTransacoes();
    return contexto ? contexto.transacoes.length : 0;
  });

  await clicarPorTexto(page, 'Salvar Transação');

  await page.waitForFunction(
    (quantidadeAntes) => {
      const contexto = window.__obterContextoTransacoes();
      return !!contexto && contexto.transacoes.length > quantidadeAntes;
    },
    { timeout: TIMEOUT },
    antes
  );
}

function parseValorBR(s) {
  if (!s) return null;
  let limpo = s.replace(/\s/g, '');
  if (limpo.includes('.') && limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes(',')) {
    limpo = limpo.replace(',', '.');
  }
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

async function obterSaldoExibido(page) {
  const valores = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return Array.from(text.matchAll(/R\$\s*([\d.,]+)/g)).map((m) => m[1]);
  });
  if (!valores.length) return null;
  return parseValorBR(valores[0]);
}

async function lerTransacoesStorage(page) {
  return page.evaluate(() => {
    const contexto = window.__obterContextoTransacoes();
    return contexto ? contexto.transacoes : [];
  });
}

async function contarTransacoes(page) {
  const t = await lerTransacoesStorage(page);
  return t.length;
}

// IMPORTANTE: Alert.alert do react-native-web é um no-op
// (node_modules/react-native-web/src/exports/Alert/index.js -> static alert() {}).
// Por isso, no Expo Web, o fluxo onLongPress -> Alert.alert -> botão "Excluir"
// nunca chama removerTransacao. Esta função:
//   1. Confirma que o item tem onLongPress ligado (fiber);
//   2. Localiza removerTransacao no contexto via fiber e a chama com o id real
//      da transação — simulando o usuário confirmando o diálogo no celular.
async function excluirComToqueLongo(page, descricao) {
  const resultado = await page.evaluate(async (search) => {
    function fiberDe(node) {
      const k = Object.keys(node).find(
        (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
      );
      return k ? node[k] : null;
    }

    const candidatos = Array.from(document.querySelectorAll('[role="button"], [tabindex]'));
    let item = null;
    for (const el of candidatos) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (el.innerText || '').includes(search)) {
        item = el;
        break;
      }
    }
    if (!item) return { ok: false, reason: 'item_nao_encontrado' };

    let temOnLongPress = false;
    let fiber = fiberDe(item);
    while (fiber) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && typeof props.onLongPress === 'function') {
        temOnLongPress = true;
      }
      fiber = fiber.return;
    }
    if (!temOnLongPress) return { ok: false, reason: 'sem_onLongPress' };

    const contexto = window.__obterContextoTransacoes();
    if (!contexto) return { ok: false, reason: 'contexto_nao_encontrado' };

    const alvo = contexto.transacoes.find((t) => (t.descricao || '').includes(search));
    if (!alvo) return { ok: false, reason: 'transacao_nao_no_contexto' };

    await contexto.removerTransacao(alvo.id);
    return { ok: true, id: alvo.id };
  }, descricao);

  if (!resultado.ok) {
    throw new Error(`Falha ao acionar exclusão: ${resultado.reason}`);
  }
  return resultado;
}

module.exports = {
  TIMEOUT,
  novaPagina,
  abrirApp,
  limparTransacoes,
  dispensarBoasVindas,
  clicarPorTexto,
  irParaNovaTransacao,
  preencherFormulario,
  salvar,
  obterSaldoExibido,
  lerTransacoesStorage,
  contarTransacoes,
  excluirComToqueLongo,
};
