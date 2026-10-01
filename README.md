# s3-lite-installer

## Segredos no build

- O `.env` que vai para a pasta instalada (`C:\s3lite\.env`) vem de `infra/app.env` e só tem `NODE_ENV`.
  O `public/.env` da máquina de release nunca entra no pacote.
- `GH_TOKEN` (para `npm run publish`) fica só na variável de ambiente da máquina de release.
- `scripts/after-pack.js` faz o build falhar se o pacote tiver token do GitHub, `.env` com outra chave
  além de `NODE_ENV`, ou um `.env` dentro do `app.asar`.
- O `app.asar` leva só `src/` (mais `package.json` e as dependências de produção).
