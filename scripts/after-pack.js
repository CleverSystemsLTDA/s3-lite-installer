// afterPack do electron-builder: falha o build se um segredo for parar no instalador.
// Imprime so caminho e nome de chave, nunca o valor.
const fs = require("fs");
const { join, relative } = require("path");

const CHAVES_PERMITIDAS = ["NODE_ENV"];
const PADRAO_TOKEN = /gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}/;
const BLOCO = 8 * 1024 * 1024;

function listarArquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const caminho = join(dir, item.name);
    return item.isDirectory() ? listarArquivos(caminho) : [caminho];
  });
}

// Le em blocos: application.exe e o binario do electron passam de 100 MB.
function temToken(arquivo) {
  const fd = fs.openSync(arquivo, "r");
  const bloco = Buffer.alloc(BLOCO);
  let resto = "";
  try {
    let lidos;
    while ((lidos = fs.readSync(fd, bloco, 0, BLOCO, null)) > 0) {
      const texto = resto + bloco.toString("latin1", 0, lidos);
      if (PADRAO_TOKEN.test(texto)) return true;
      resto = texto.slice(-128);
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

// O cabecalho do app.asar e um JSON no inicio do arquivo, com a arvore de arquivos.
function asarTemEnv(asar) {
  const fd = fs.openSync(asar, "r");
  try {
    const inicio = Buffer.alloc(16);
    fs.readSync(fd, inicio, 0, 16, 0);
    const cabecalho = Buffer.alloc(inicio.readUInt32LE(12));
    fs.readSync(fd, cabecalho, 0, cabecalho.length, 16);
    return /"\.env":/.test(cabecalho.toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = async function afterPack({ appOutDir }) {
  const erros = [];

  // O .env precisa ir no pacote: e ele que sobrescreve o .env antigo das maquinas na atualizacao.
  const env = join(appOutDir, ".env");
  if (!fs.existsSync(env)) {
    erros.push(".env nao foi empacotado");
  } else {
    const chaves = fs
      .readFileSync(env, "utf8")
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter((linha) => linha && !linha.startsWith("#"))
      .map((linha) => linha.split("=")[0].trim());
    const extras = chaves.filter((chave) => !CHAVES_PERMITIDAS.includes(chave));
    if (extras.length) erros.push(`.env com chave nao permitida: ${extras.join(", ")}`);
  }

  const asar = join(appOutDir, "resources", "app.asar");
  if (fs.existsSync(asar) && asarTemEnv(asar)) erros.push("resources/app.asar tem um .env dentro");

  const appUpdate = join(appOutDir, "resources", "app-update.yml");
  if (fs.existsSync(appUpdate) && /^\s*token\s*:/m.test(fs.readFileSync(appUpdate, "utf8"))) {
    erros.push("resources/app-update.yml tem a chave token");
  }

  for (const arquivo of listarArquivos(appOutDir)) {
    if (temToken(arquivo)) erros.push(`token do GitHub em ${relative(appOutDir, arquivo)}`);
  }

  if (erros.length) throw new Error(`afterPack: segredo no pacote\n- ${erros.join("\n- ")}`);
};
