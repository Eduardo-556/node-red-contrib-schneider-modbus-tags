# node-red-contrib-schneider-modbus-tags

Read Schneider **M221** and **M241** `%MW` memory over Modbus TCP and get real values (float, dint, int, bool, string) straight into Node-RED, without a function node to rebuild them.

[Português](#português) · [English](#english)

---

## Português

### O que faz

Com o `node-red-contrib-modbus` você recebe um array de registros e precisa de uma função para montar float, dint e string. Este pacote faz isso direto: você escreve a lista de tags e recebe

```js
msg.payload = { velocidade_pct: 87.5, codigo_bobina: "BOB-77812A", bobinas_prontas: 12, plc_run: true }
```

### Instalação

No Node-RED: **Menu → Gerenciar paleta → Instalar** e procure `node-red-contrib-schneider-modbus-tags`.

Ou pela linha de comando, na pasta do Node-RED (normalmente `~/.node-red`):

```
npm install node-red-contrib-schneider-modbus-tags
```

### Nós

| Nó | Para quê |
|---|---|
| **schneider-plc** | Conexão Modbus TCP (IP, porta, unit id). Vários nós de leitura podem usar a mesma. |
| **schneider read** | Lê as tags a cada N segundos (ou quando chega uma mensagem) e envia os valores. |
| **schneider decode** | Só converte. Use depois do flex getter do `node-red-contrib-modbus` se você já tem a leitura pronta. |

### Lista de tags

Uma por linha: `endereço tipo nome`. Use os mesmos endereços do SoMachine / Machine Expert. O tipo é opcional: sem ele, `MW` vira `int`, `MF` vira `float` e `MD` vira `dint`.

```
MF0     temperatura
MD4     contador
MW10    setpoint
MW12.3  motor_ligado
MW60200 bool       plc_run
MW60206 float      velocidade_pct
MW60210 string[20] codigo_bobina
MW60222 int        bobinas_prontas
MW60226 dint       bobina_horas
MW60300 bool.3     motor_ligado
```

| Tipo | Registros | Valor |
|---|---|---|
| `bool` | 1 | word inteira, `true` quando diferente de 0 |
| `bool.N` | 1 | bit N (0 a 15) da word |
| `int` | 1 | 16 bits com sinal |
| `uint` / `word` | 1 | 16 bits sem sinal |
| `dint` | 2 | 32 bits com sinal (`%MD`) |
| `udint` / `dword` | 2 | 32 bits sem sinal |
| `float` / `real` | 2 | REAL 32 bits (`%MF`) |
| `string[N]` | N/2 | N caracteres ASCII, termina no primeiro byte 0 |

`%MWn` é o registro Modbus `n` (base 0). A posição de `%MF`/`%MD` depende do modelo escolhido na conexão: no M221 `%MD4` ocupa `%MW4` e `%MW5`; no M241 ocupa `%MW8` e `%MW9`. Endereços próximos são lidos juntos, no menor número de requisições possível.

### Ordem dos bytes

O M221 e o M241 guardam valores de 32 bits com a **word baixa primeiro** e strings com o **primeiro caractere no byte baixo**. Isso já é o padrão. Os nós têm opções para inverter, caso algum equipamento use outra ordem.

### Exemplo

Importe `examples/leitura-op1475.json` (Menu → Importar → Exemplos).

---

## English

### What it does

With `node-red-contrib-modbus` you get an array of registers and need a function node to build floats, dints and strings. This package does it for you: write the tag list and get

```js
msg.payload = { speed_pct: 87.5, coil_code: "BOB-77812A", coils_done: 12, plc_run: true }
```

### Install

In Node-RED: **Menu → Manage palette → Install**, search for `node-red-contrib-schneider-modbus-tags`.

Or from your Node-RED user directory (usually `~/.node-red`):

```
npm install node-red-contrib-schneider-modbus-tags
```

### Nodes

| Node | Purpose |
|---|---|
| **schneider-plc** | Modbus TCP connection (IP, port, unit id). Several read nodes can share it. |
| **schneider read** | Reads the tags every N seconds (or on an input message) and sends the values. |
| **schneider decode** | Decoding only. Use it after the `node-red-contrib-modbus` flex getter if you already read the registers. |

### Tag list

One per line: `address type name`, using the SoMachine / Machine Expert addresses (`MW`, `MF`, `MD`, `MW12.3`). The type is optional: `MW` defaults to `int`, `MF` to `float`, `MD` to `dint`. `%MF`/`%MD` placement follows the PLC model chosen in the connection (M221: `%MD4` = `%MW4`-`%MW5`; M241: `%MW8`-`%MW9`). Types: `bool`, `bool.N`, `int`, `uint`/`word`, `dint`, `udint`/`dword`, `float`/`real`, `string[N]` (see the table above). `%MWn` is Modbus holding register `n` (base 0). Close addresses are grouped into as few requests as possible.

### Byte order

M221 and M241 store 32-bit values **low word first** and strings with the **first character in the low byte**. That is the default; each node has options to change it for other devices.

### Tests

```
npm test            # decoding + Modbus simulator
npm run test:nodes  # nodes inside Node-RED (needs dev dependencies)
```

## License

MIT
