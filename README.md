# node-red-contrib-schneider-modbus-tags

Read Schneider **M221** and **M241** memory (`%MW`, `%MF`, `%MD`) over Modbus TCP and get real values (float, dint, int, bool, string) straight into Node-RED, without a function node to rebuild them.

[Português](#português) · [English](#english)

---

## Português

### O que faz

Com o `node-red-contrib-modbus` você recebe um array de registros e precisa de uma função para montar float, dint e string. Este pacote faz isso direto: você escreve a lista de tags com os mesmos endereços do SoMachine / Machine Expert e recebe

```js
msg.payload = { temperatura: 87.5, codigo_lote: "L2026-0412", contador_pecas: 1200, motor_ligado: true }
```

### Requisitos

- Node-RED 3 ou mais novo
- Node.js 18 ou mais novo
- CLP com o servidor Modbus TCP habilitado (porta 502)

### Instalação

No Node-RED: **Menu → Gerenciar paleta → Instalar** e procure `node-red-contrib-schneider-modbus-tags`.

Ou pela linha de comando, na pasta do Node-RED (normalmente `~/.node-red`), e depois reinicie o Node-RED:

```
npm install node-red-contrib-schneider-modbus-tags
```

### Nós

| Nó | Para quê |
|---|---|
| **schneider read** | Lê as tags a cada N segundos (ou quando chega uma mensagem) e envia os valores. |
| **schneider decode** | Só converte. Use depois do flex getter do `node-red-contrib-modbus` se você já tem a leitura pronta. |
| **schneider-plc** | Conexão Modbus TCP (modelo, IP, porta, unit id). É um nó de configuração: não aparece na paleta, você cria pelo campo **PLC** do nó read. Vários nós read podem usar a mesma conexão. |

### Lista de tags

Uma por linha: `endereço tipo nome`. Tipo e nome são opcionais. Sem tipo, `MW` vira `int`, `MF` vira `float` e `MD` vira `dint`. Sem nome, a chave é o próprio endereço (`MF0`).

```
MF0      temperatura
MD2      contador_pecas
MW4      setpoint
MW5.0    motor_ligado
MW10     string[20] codigo_lote
MW30     bool       alarme
MW31     uint       status
```

| Tipo | Registros | Valor |
|---|---|---|
| `bool` | 1 | word inteira, `true` quando diferente de 0 |
| `bool.N` ou `MWx.N` | 1 | bit N (0 a 15) da word |
| `int` | 1 | 16 bits com sinal |
| `uint` / `word` | 1 | 16 bits sem sinal |
| `dint` | 2 | 32 bits com sinal (`%MD`) |
| `udint` / `dword` | 2 | 32 bits sem sinal |
| `float` / `real` | 2 | REAL 32 bits (`%MF`) |
| `string[N]` | N/2 | N caracteres ASCII, termina no primeiro byte 0 |

- Aceita `%MW10`, `MW10`, `mw10` e `MW10 : float`. Texto depois de `#` ou `//` é comentário.
- Cada nome precisa ser único, porque vira uma chave do `msg.payload`.
- `%MWn` é o registro Modbus `n` (base 0). A posição de `%MF`/`%MD` depende do modelo escolhido na conexão: no M221 `%MD4` ocupa `%MW4` e `%MW5`; no M241 ocupa `%MW8` e `%MW9`.
- No M221, `%MF0`, `%MD0` e `%MW0` são a mesma memória. Não use endereços que se sobrepõem para variáveis diferentes.
- Endereços próximos são lidos juntos, no menor número de requisições possível.

### Saída do nó read

| Propriedade | Conteúdo |
|---|---|
| `msg.payload` | Objeto com um valor por tag |
| `msg.timestamp` | Hora da leitura (ms) |
| `msg.topic` | Topic da mensagem de entrada, senão o topic configurado, senão o nome da conexão |

Se o CLP não responder, o nó mostra o erro embaixo dele e gera um erro que pode ser tratado com um nó **catch**. Nada é enviado nesse caso.

### Ordem dos bytes

O M221 e o M241 guardam valores de 32 bits com a **word baixa primeiro** e strings com o **primeiro caractere no byte baixo**. Isso já é o padrão. Os nós têm opções para inverter, caso algum equipamento use outra ordem. A opção **Float decimals** arredonda os float (vazio = sem arredondar).

### Limitações desta versão

- Somente leitura (sem escrita no CLP).
- Somente Modbus TCP (sem RTU/serial).
- Testado em CLPs M221 e M241 reais.

### Exemplo

**Menu → Importar → Exemplos → node-red-contrib-schneider-modbus-tags → leitura-basica**. Ajuste o IP e a lista de tags.

---

## English

### What it does

With `node-red-contrib-modbus` you get an array of registers and need a function node to build floats, dints and strings. This package does it for you: write the tag list using the same addresses as in SoMachine / Machine Expert and get

```js
msg.payload = { temperature: 87.5, batch_code: "L2026-0412", part_count: 1200, motor_on: true }
```

### Requirements

- Node-RED 3 or newer
- Node.js 18 or newer
- PLC with the Modbus TCP server enabled (port 502)

### Install

In Node-RED: **Menu → Manage palette → Install**, search for `node-red-contrib-schneider-modbus-tags`.

Or from your Node-RED user directory (usually `~/.node-red`), then restart Node-RED:

```
npm install node-red-contrib-schneider-modbus-tags
```

### Nodes

| Node | Purpose |
|---|---|
| **schneider read** | Reads the tags every N seconds (or on an input message) and sends the values. |
| **schneider decode** | Decoding only. Use it after the `node-red-contrib-modbus` flex getter if you already read the registers. |
| **schneider-plc** | Modbus TCP connection (model, IP, port, unit id). It is a configuration node: it is not in the palette, you create it from the **PLC** field of the read node. Several read nodes can share it. |

### Tag list

One per line: `address type name`. Type and name are optional. Without a type, `MW` is `int`, `MF` is `float` and `MD` is `dint`. Without a name, the key is the address (`MF0`). Types: `bool`, `bool.N` (or `MWx.N`), `int`, `uint`/`word`, `dint`, `udint`/`dword`, `float`/`real`, `string[N]` (see the table above).

- `%MW10`, `MW10`, `mw10` and `MW10 : float` are all accepted. Text after `#` or `//` is a comment.
- Each name must be unique, since it becomes a key in `msg.payload`.
- `%MWn` is Modbus holding register `n` (base 0). `%MF`/`%MD` placement follows the PLC model chosen in the connection (M221: `%MD4` = `%MW4`-`%MW5`; M241: `%MW8`-`%MW9`).
- On the M221, `%MF0`, `%MD0` and `%MW0` are the same memory. Do not use overlapping addresses for different variables.
- Close addresses are grouped into as few requests as possible.

### Read node output

`msg.payload` (one value per tag), `msg.timestamp` (read time in ms), `msg.topic` (input message topic, else the configured topic, else the connection name). If the PLC does not answer, the node shows the error and raises it for a **catch** node; nothing is sent.

### Byte order

M221 and M241 store 32-bit values **low word first** and strings with the **first character in the low byte**. That is the default; each node has options to change it for other devices. **Float decimals** rounds floats (empty = no rounding).

### Limitations of this version

- Read only (no writing to the PLC).
- Modbus TCP only (no RTU/serial).
- Tested on real M221 and M241 PLCs.

### Example

**Menu → Import → Examples → node-red-contrib-schneider-modbus-tags → leitura-basica**. Set the IP and the tag list.

### Tests

```
npm install
npm test            # decoding + Modbus simulator
npm run test:nodes  # nodes inside Node-RED (Node.js 22.9+)
```

## License

MIT. This project is not affiliated with or endorsed by Schneider Electric. M221, M241, SoMachine and Machine Expert are trademarks of their respective owners.
