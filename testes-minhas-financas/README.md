# Simulação de Testes — Passo 8.1, Aula 4

Este documento descreve a suíte de testes E2E criada para o passo 8.1 do `STEPS.md` e mostra como **simular bugs** para ver os testes pegando regressões — material didático para a Aula 4.

---

Suíte automatizada que executa o roteiro do passo 8.1 contra o app rodando no Expo Web, usando **Jest + Puppeteer**. Cada teste limpa o `localStorage` antes de rodar (equivalente a um AsyncStorage zerado).

### Estrutura

```
tests/
├── package.json            # deps: jest, jest-html-reporters, puppeteer
├── jest.config.js          # reporters: default + jest-html-reporters
├── helpers.js              # utilitários (find-by-text, fiber, etc.)
├── passo-8.1.test.js       # 4 testes mapeando os 8 sub-passos
├── README.md               # como rodar
├── SIMULACAO_TESTES.md     # este arquivo
└── reports/
    └── YYYY-MM-DDTHH-MM-report.html
```

### Cobertura dos 8 sub-passos do roteiro

| Teste                                              | Sub-passos do 8.1 | O que valida                                                 |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `1) Abre o app na tela vazia`                      | 1                 | Empty state com ícone de carteira e instrução                |
| `2-5) Adiciona receita e despesa; saldo = 3050`    | 2, 3, 4, 5        | Formulário salva, lista atualiza, saldo é `receitas - despesas` |
| `6) Transações persistem após fechar/reabrir`      | 6                 | `AsyncStorage.setItem` na adição, leitura no `useEffect`     |
| `7-8) Item tem onLongPress; remover esvazia lista` | 7, 8              | `onLongPress` ligado em `ItemTransacao`, `removerTransacao` apaga do estado e do storage |

### Como rodar

Em **dois terminais**:

```bash
# Terminal 1 — sobe o Expo Web
cd minhas-financas && npx expo start --web

# Terminal 2 — roda os testes
cd minhas-financas/tests && npm test
```

Modo headed (vê o navegador): `HEADLESS=false npm test`.

Relatório HTML em `tests/reports/YYYY-MM-DDTHH-MM-report.html` após cada execução.

---

## Detalhes técnicos relevantes

### `Alert.alert` no react-native-web é no-op

Verificado em `node_modules/react-native-web/src/exports/Alert/index.js`:

```js
class Alert {
  static alert() {}
}
```

Logo, no Expo Web, o fluxo `onLongPress → Alert.alert → botão "Excluir" → removerTransacao` **não completa pelo navegador**. Nenhum gesto sintético (touch, mouse hold, dispatch de pointer events) muda isso — a chamada `Alert.alert(...)` simplesmente não faz nada.

**Solução adotada no teste 7-8:** acessar o fiber do React e validar que (a) o item tem `onLongPress` ligado e (b) o contexto expõe `removerTransacao`; em seguida, chamar `removerTransacao(id)` diretamente — equivalente a confirmar "Excluir" no celular. No dispositivo real, o `Alert.alert` funciona normalmente; a limitação é apenas do RN-web.

### Tela de boas-vindas

`App.js` mantém `primeiroAcesso=true` em estado local (perde valor a cada reload). O helper `abrirApp` clica automaticamente no botão de CTA da `BoasVindasScreen` antes de cada teste.

---

## Simulando erros

Para ver o relatório HTML mostrando uma falha — útil para a aula —, aplique uma das alterações abaixo no app, rode `npm test` e abra o `reports/...html`. Reverta depois com `git checkout <arquivo>`.

### Opção 1 — Quebrar a persistência (teste 6 falha)

Por que é didática: é exatamente o bug que motivou a Aula 4 — sem `AsyncStorage.setItem`, os dados somem ao fechar o app. Mostra o teste pegando uma regressão real do conteúdo da aula.

`context/TransacoesContext.js`, função `adicionarTransacao`:

```js
async function adicionarTransacao(novaTransacao) {
  const atualizadas = [novaTransacao, ...transacoes];
  setTransacoes(atualizadas);
  // await AsyncStorage.setItem(CHAVE_STORAGE, JSON.stringify(atualizadas)); // ← comentado
}
```

**Resultado esperado no relatório:**

- ✓ 1) Abre o app na tela vazia
- ✓ 2-5) Adiciona receita e despesa; saldo = 3050
- ✗ **6) Transações persistem após fechar/reabrir** — `Expected length: 1, Received length: 0`
- ✓ 7-8) onLongPress + remover

### Opção 2 — Quebrar o cálculo do saldo (teste 2-5 falha)

`context/TransacoesContext.js`:

```js
const valor = {
  ...
  saldo: receitas + despesas,   // ← era receitas - despesas
  ...
};
```

**Resultado esperado:**

- ✗ **2-5) Adiciona receita e despesa; saldo = 3050** — `Expected: 3050, Received: 3350`

### Opção 3 — Esquecer o `onLongPress` (teste 7-8 falha)

`screens/DashboardScreen.js`, dentro do `transacoes.map(...)`:

```jsx
<ItemTransacao
  key={t.id}
  descricao={t.descricao}
  valor={t.valor}
  tipo={t.tipo}
  categoria={t.categoria}
  data={t.data}
  onPress={() => navigation.navigate('DetalheTransacao', { transacao: t })}
  // onLongPress={() => confirmarExclusao(t.id, t.descricao)}  ← comentado
/>
```

**Resultado esperado:**

- ✗ **7-8) Item tem onLongPress ligado; remover via contexto esvazia a lista e o storage** — `Falha ao acionar exclusão: sem_onLongPress`

---

## Como reverter qualquer simulação

```bash
cd minhas-financas
git checkout context/TransacoesContext.js screens/DashboardScreen.js
npm test --prefix tests
```

Os 4 testes devem voltar a passar.
