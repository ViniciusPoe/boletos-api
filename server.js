require('dotenv').config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise"); // MySQL/MariaDB com Promises

const app = express();
app.use(cors());
app.use(express.json());

let ultimaBusca = null;
let pastaSelecionada = null;

// --- Configuração MariaDB ---
const dbConfig = {
  host: process.env.DB_HOST || "168.75.84.128",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// --- Helper para formatar data como DD/MM/YYYY ---
function formatarData(date) {
  if (!date) return '';
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// --- Helper para formatar mensagem de pastas ---
function formatarMensagemPastas(pastas) {
  const mesesPt = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];

  let msg = `✅ *Foram encontrados boletos em ${pastas.length} meses:*\n\n`;
  pastas.forEach((p, i) => {
    let nomeMes = p.nome;
    const parts = p.nome.split('-'); // ex: 2025-09
    if (parts.length === 2) {
      const [ano, mesNum] = parts;
      const mesIndex = parseInt(mesNum, 10) - 1;
      if (mesIndex >= 0 && mesIndex < 12) {
        nomeMes = `${mesesPt[mesIndex]} / ${ano}`;
      }
    }
    msg += `*${i+1}* - ${nomeMes}\n`;
  });
  msg += "\n📋 *Digite o número do mês para acessar:*";
  return msg;
}

// --- Helper para formatar mensagem de documentos ---
function formatarMensagemDocumentos(pasta) {
  const mesesPt = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];

  let nomeMes = pasta.nome;
  const parts = pasta.nome.split('-');
  if (parts.length === 2) {
    const [ano, mesNum] = parts;
    const mesIndex = parseInt(mesNum, 10) - 1;
    if (mesIndex >= 0 && mesIndex < 12) {
      nomeMes = `${mesesPt[mesIndex]} / ${ano}`;
    }
  }

  let msg = `📁 *Mês escolhido: ${nomeMes}*\n`;
  msg += `✅ *Encontrados ${pasta.documentos.length} boleto(s):*\n\n`;
  pasta.documentos.forEach((doc, i) => {
    const nomeEmpresa = doc.cliente;
    const dataVenc = doc.data_vencimento;
    msg += `*${i+1}* - ${nomeEmpresa} (${formatarData(new Date(dataVenc))})\n`;
  });
  msg += "\n💾 *Escolha qual boleto deseja fazer o download:*";
  return msg;
}

// --- Helper para formatar mensagem de download ---
function formatarMensagemDownload(doc) {
  const nomeEmpresa = doc.cliente;
  const dataVenc = doc.data_vencimento;
  return `📄 *Boleto encontrado!*\n\n*Nome:* ${nomeEmpresa} (${formatarData(new Date(dataVenc))})\n*Link:* ${doc.url_boleto}\n\n🔗 *Clique no link para baixar*`;
}

// --- Endpoints ---
app.post('/buscar_documentos', async (req, res) => {
  try {
    const query = (req.body.cnpj || req.body.nota_fiscal || "").toString();
    if (!query) return res.json({ message: "❌ CNPJ ou nota_fiscal não informados." });

    const connection = await mysql.createConnection(dbConfig);

    // --- Consulta no MariaDB ---
    const [rows] = await connection.execute(
      `SELECT * FROM boletos WHERE cnpj LIKE ? OR nota_fiscal LIKE ?`,
      [`%${query}%`, `%${query}%`]
    );

    await connection.end();

    if (!rows.length) return res.json({ message: "❌ Nenhum documento encontrado." });

    // Agrupa por mês/ano
    const pastasMap = {};
    rows.forEach(r => {
      const data = new Date(r.data_vencimento);
      const key = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}`;
      if (!pastasMap[key]) pastasMap[key] = [];
      pastasMap[key].push(r);
    });

    const pastas = Object.entries(pastasMap)
      .map(([nome, documentos]) => ({ nome, documentos }))
      .sort((a,b) => a.nome.localeCompare(b.nome));

    ultimaBusca = { pastas };
    res.json({ message: formatarMensagemPastas(pastas) });

  } catch (err) {
    res.json({ message: `❌ Erro interno: ${err.message}` });
  }
});

app.post('/listar_documentos', (req, res) => {
  const pasta = ultimaBusca?.pastas?.[req.body.numero_pasta - 1];
  if (!pasta) return res.json({ message: "❌ Mês inválido ou nenhuma busca realizada." });
  pastaSelecionada = pasta;
  res.json({ message: formatarMensagemDocumentos(pasta) });
});

app.post('/baixar_documento', (req, res) => {
  const doc = pastaSelecionada?.documentos?.[req.body.numero_documento - 1];
  if (!doc) return res.json({ message: "❌ Documento inválido ou nenhum Mês selecionado." });
  res.json({ message: formatarMensagemDownload(doc) });
});

// --- Start server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}`));
