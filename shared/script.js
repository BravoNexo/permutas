const CONFIGURACAO = window.BRAVONEXO_CONFIG || {};
const URL_API = String(CONFIGURACAO.apiUrl || "").trim();

function aplicarConfiguracaoUnidade() {
  const nomeSistema = CONFIGURACAO.nomeSistema || "Sistema de Permutas";
  const nomeUnidade = CONFIGURACAO.nomeUnidade || "Unidade não configurada";
  const versao = CONFIGURACAO.versao || "";

  document.title = nomeSistema + " - " + nomeUnidade;

  const subtitulo = document.getElementById("nomeUnidade");
  const rodape = document.getElementById("rodapeSistema");
  const brasao = document.getElementById("brasaoUnidade");
  const tituloApple = document.querySelector('meta[name="apple-mobile-web-app-title"]');

  if (subtitulo) subtitulo.textContent = nomeUnidade;
  if (rodape) rodape.textContent = "Sistema interno de solicitação de permutas " + versao + " • " + nomeUnidade;
  if (brasao) {
    brasao.src = CONFIGURACAO.brasao || "brasao.png";
    brasao.alt = CONFIGURACAO.brasaoAlt || ("Brasão do " + nomeUnidade);
  }
  if (tituloApple) tituloApple.setAttribute("content", CONFIGURACAO.nomeCurto || ("Permutas " + nomeUnidade));
}

const rgEntra = document.getElementById("rgEntra");
const rgSai = document.getElementById("rgSai");
const idEntra = document.getElementById("idEntra");
const idSai = document.getElementById("idSai");
const form = document.getElementById("formPermuta");
const btnEnviar = document.getElementById("btnEnviar");
const mensagem = document.getElementById("mensagem");
const dataServico = document.getElementById("dataServico");
const avisoPrazoPermuta = document.getElementById("avisoPrazoPermuta");

const btnAbrirConsulta = document.getElementById("btnAbrirConsulta");
const areaConsulta = document.getElementById("areaConsulta");
const rgConsulta = document.getElementById("rgConsulta");
const btnConsultar = document.getElementById("btnConsultar");
const resultadoConsulta = document.getElementById("resultadoConsulta");

const btnAbrirHistorico = document.getElementById("btnAbrirHistorico");
const areaHistorico = document.getElementById("areaHistorico");
const rgHistorico = document.getElementById("rgHistorico");
const btnConsultarHistorico = document.getElementById("btnConsultarHistorico");
const resultadoHistorico = document.getElementById("resultadoHistorico");

let militaresPorRG = {};
let timerConsultaEntra = null;
let timerConsultaSai = null;
let ultimoRgConsultado = "";

aplicarConfiguracaoUnidade();
carregarMilitares();

async function chamarApi(acao, dados = {}) {
  if (!URL_API) {
    throw new Error("Configuração da unidade não encontrada.");
  }

  const resposta = await fetch(URL_API, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: acao,
      dados: dados
    })
  });

  if (!resposta.ok) {
    throw new Error("Falha de comunicação com o servidor.");
  }

  const resultado = await resposta.json();

  if (resultado.sucesso === false || resultado.ok === false) {
    throw new Error(resultado.mensagem || resultado.erro || "Erro ao executar a ação.");
  }

  return resultado;
}

async function carregarMilitares() {
  try {
    const resultado = await chamarApi("carregarMilitares");
    const militares = resultado.militares || resultado.resposta || [];

    militaresPorRG = {};

    militares.forEach((militar) => {
      const rg = limparRG(militar.rg || militar.RG || militar.registroGeral);

      if (rg) {
        militaresPorRG[rg] = militar;
      }
    });

    console.log("Militares carregados:", Object.keys(militaresPorRG).length);

  } catch (erro) {
    militaresPorRG = {};
    console.log("Erro ao carregar militares:", erro.message);

    mensagem.textContent =
      "Erro ao carregar a base de militares. Verifique a conexão ou o link da API.";
    mensagem.className = "mensagem erro";
  }
}

rgEntra.addEventListener("input", () => {
  tratarDigitacaoRG(rgEntra, idEntra, "entra");
});

rgSai.addEventListener("input", () => {
  tratarDigitacaoRG(rgSai, idSai, "sai");
});

rgEntra.addEventListener("blur", () => {
  mostrarIdentificacaoLocal(rgEntra, idEntra);
});

rgSai.addEventListener("blur", () => {
  mostrarIdentificacaoLocal(rgSai, idSai);
});

dataServico.addEventListener("change", () => {
  verificarPrazoPermuta();
});

dataServico.addEventListener("input", () => {
  verificarPrazoPermuta();
});

btnAbrirConsulta.addEventListener("click", () => {
  areaConsulta.classList.toggle("ativa");

  if (areaConsulta.classList.contains("ativa")) {
    rgConsulta.focus();
  }
});

rgConsulta.addEventListener("input", () => {
  rgConsulta.value = limparRG(rgConsulta.value);
});

btnConsultar.addEventListener("click", () => {
  consultarPermutasFuturas();
});

btnAbrirHistorico.addEventListener("click", () => {
  areaHistorico.classList.toggle("ativa");

  if (areaHistorico.classList.contains("ativa")) {
    rgHistorico.focus();
  }
});

rgHistorico.addEventListener("input", () => {
  rgHistorico.value = limparRG(rgHistorico.value);
});

btnConsultarHistorico.addEventListener("click", () => {
  consultarHistoricoPermutas();
});

resultadoConsulta.addEventListener("input", (e) => {
  if (e.target.classList.contains("codigo-cancelamento")) {
    e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
  }
});

resultadoConsulta.addEventListener("click", (e) => {
  const botaoCancelar = e.target.closest(".botao-cancelar");
  const botaoEnviarCodigo = e.target.closest(".botao-enviar-codigo");
  const botaoConfirmarCancelamento = e.target.closest(".botao-confirmar-cancelamento");

  if (botaoCancelar) {
    const chave = botaoCancelar.dataset.chave;
    const area = document.getElementById("cancelamento-" + chave);

    if (area) {
      area.classList.toggle("ativa");
    }

    return;
  }

  if (botaoEnviarCodigo) {
    solicitarCodigoCancelamento({
      chave: botaoEnviarCodigo.dataset.chave,
      linha: botaoEnviarCodigo.dataset.linha,
      idPermuta: botaoEnviarCodigo.dataset.idPermuta,
      rgConsulta: botaoEnviarCodigo.dataset.rgConsulta
    });
    return;
  }

  if (botaoConfirmarCancelamento) {
    confirmarCancelamento({
      chave: botaoConfirmarCancelamento.dataset.chave,
      linha: botaoConfirmarCancelamento.dataset.linha,
      idPermuta: botaoConfirmarCancelamento.dataset.idPermuta,
      rgConsulta: botaoConfirmarCancelamento.dataset.rgConsulta
    });
    return;
  }
});

function limparRG(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 7);
}

function normalizarEmail(valor) {
  return String(valor || "").trim().toLowerCase();
}

function separarEmailsSite(valor) {
  return String(valor || "")
    .split(/[;,\n]/)
    .map(normalizarEmail)
    .filter(email => email);
}

function obterEmailsMilitar(militar) {
  if (!militar) return [];

  const bruto =
    militar.email ||
    militar.eMail ||
    militar.Email ||
    militar.EMAIL ||
    militar.emailCadastrado ||
    militar.emailCadastro ||
    "";

  return separarEmailsSite(bruto);
}

function tratarDigitacaoRG(input, elementoResultado, tipo) {
  input.value = limparRG(input.value);

  elementoResultado.textContent = "";
  elementoResultado.classList.remove("erro-identificacao");

  if (tipo === "entra") {
    clearTimeout(timerConsultaEntra);

    timerConsultaEntra = setTimeout(() => {
      mostrarIdentificacaoLocal(input, elementoResultado);
    }, 600);
  }

  if (tipo === "sai") {
    clearTimeout(timerConsultaSai);

    timerConsultaSai = setTimeout(() => {
      mostrarIdentificacaoLocal(input, elementoResultado);
    }, 600);
  }
}

function mostrarIdentificacaoLocal(input, elementoResultado) {
  const rg = limparRG(input.value);

  elementoResultado.textContent = "";
  elementoResultado.classList.remove("erro-identificacao");

  if (rg.length < 4) return;

  const militar = militaresPorRG[rg];

  if (militar) {
    elementoResultado.textContent = militar.identificacao || montarIdentificacaoMilitar(militar);
    elementoResultado.classList.remove("erro-identificacao");
  }
}

function montarIdentificacaoMilitar(militar) {
  const partes = [];

  if (militar.postoGrad) partes.push(militar.postoGrad);
  if (militar.posto) partes.push(militar.posto);
  if (militar.nomeGuerra) partes.push(militar.nomeGuerra);
  if (militar.qbmp) partes.push(militar.qbmp);
  if (militar.rg) partes.push("RG " + militar.rg);

  return partes.join(" ");
}

function verificarPrazoPermuta() {
  const valorData = dataServico.value;

  avisoPrazoPermuta.textContent = "";
  avisoPrazoPermuta.classList.remove("ativo");

  if (!valorData) return;

  const partes = valorData.split("-");

  if (partes.length !== 3) return;

  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  const dataSelecionada = new Date(ano, mes - 1, dia, 0, 0, 0);

  const limiteMinimo = new Date();
  limiteMinimo.setHours(limiteMinimo.getHours() + 48);

  if (dataSelecionada < limiteMinimo) {
    avisoPrazoPermuta.textContent =
      "Atenção: esta solicitação está fora do prazo regulamentar de 48 horas de antecedência. A permuta será registrada, mas ficará sujeita à análise administrativa.";
    avisoPrazoPermuta.classList.add("ativo");
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  verificarPrazoPermuta();

  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando...";
  mensagem.className = "mensagem";
  mensagem.textContent = "";

  const dados = {
    email: document.getElementById("email").value,
    dataServico: document.getElementById("dataServico").value,
    rgEntra: document.getElementById("rgEntra").value,
    rgSai: document.getElementById("rgSai").value,
    observacoes: document.getElementById("observacoes").value
  };

  try {
    const resultado = await chamarApi("enviarPermuta", dados);
    const resposta = resultado.resposta || resultado;

    mensagem.innerHTML =
      escaparHtml(resposta.mensagem || "Permuta enviada com sucesso.") +
      "<br><br><strong>Data do serviço:</strong> " + formatarDataBrasileira(dados.dataServico) +
      "<br><strong>Entra:</strong> " + escaparHtml(resposta.militarEntra || resposta.nomeEntra || "") +
      "<br><strong>Sai:</strong> " + escaparHtml(resposta.militarSai || resposta.nomeSai || "");

    mensagem.className = "mensagem sucesso";

    form.reset();
    idEntra.textContent = "";
    idSai.textContent = "";
    avisoPrazoPermuta.textContent = "";
    avisoPrazoPermuta.classList.remove("ativo");

    if (resposta.linhaProcessamento) {
      tentarProcessarPermuta(resposta.linhaProcessamento, 1);
    } else {
      console.log("Linha de processamento não retornada.");
    }

  } catch (erro) {
    mensagem.textContent = erro.message;
    mensagem.className = "mensagem erro";
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar Solicitação";
  }
});

async function consultarPermutasFuturas() {
  const rg = limparRG(rgConsulta.value);

  resultadoConsulta.innerHTML = "";
  ultimoRgConsultado = rg;

  if (rg.length < 4) {
    resultadoConsulta.innerHTML =
      '<div class="mensagem-consulta">Informe um RG válido para consultar.</div>';
    return;
  }

  btnConsultar.disabled = true;
  btnConsultar.textContent = "Consultando...";

  try {
    const resultado = await chamarApi("consultarPermutasFuturas", {
      rg: rg,
      rgConsulta: rg
    });

    const resposta = resultado.resposta || resultado;
    const permutas = Array.isArray(resposta) ? resposta : (resposta.permutas || []);

    exibirPermutasFuturas(permutas, rg);

  } catch (erro) {
    resultadoConsulta.innerHTML =
      '<div class="mensagem-consulta">' + escaparHtml(erro.message) + '</div>';
  } finally {
    btnConsultar.disabled = false;
    btnConsultar.textContent = "Consultar";
  }
}

function exibirPermutasFuturas(permutas, rgConsultadoParametro) {
  console.log("Permutas recebidas:", permutas);

  if (!permutas || permutas.length === 0) {
    resultadoConsulta.innerHTML =
      '<div class="mensagem-consulta">Nenhuma permuta futura encontrada para este RG.</div>';
    return;
  }

  const rgConsultado = limparRG(rgConsultadoParametro || ultimoRgConsultado || rgConsulta.value);

  let html = "";

  permutas.forEach((permuta, indice) => {
    const chave = "p" + indice;
    const classeStatus = obterClasseStatus(permuta.status);
    const podeCancelar = verificarPodeCancelar(permuta.podeCancelar);
    const linha = String(permuta.linha || permuta.row || permuta.numeroLinha || "").trim();
    const idPermuta = String(permuta.idPermuta || permuta.id || permuta.identificador || linha).trim();
    const dataServicoTexto = permuta.dataServico || permuta.data || permuta.dataServicoFormatada || "";
    const militarEntra = permuta.militarEntra || permuta.nomeEntra || permuta.entra || "";
    const militarSai = permuta.militarSai || permuta.nomeSai || permuta.sai || "";

    const botaoCancelar = podeCancelar
      ? `
        <button type="button" class="botao-cancelar" data-chave="${escaparHtml(chave)}">
          Solicitar Cancelamento
        </button>

        <div class="area-cancelamento" id="cancelamento-${escaparHtml(chave)}">
          <input type="email" class="email-cancelamento" placeholder="E-mail cadastrado no RG consultado" autocomplete="email">

          <button type="button" class="botao-enviar-codigo" data-chave="${escaparHtml(chave)}" data-linha="${escaparHtml(linha)}" data-id-permuta="${escaparHtml(idPermuta)}" data-rg-consulta="${escaparHtml(rgConsultado)}">
            Enviar Código
          </button>

          <input type="text" class="codigo-cancelamento" inputmode="numeric" maxlength="6" placeholder="Código recebido">

          <button type="button" class="botao-confirmar-cancelamento" data-chave="${escaparHtml(chave)}" data-linha="${escaparHtml(linha)}" data-id-permuta="${escaparHtml(idPermuta)}" data-rg-consulta="${escaparHtml(rgConsultado)}">
            Confirmar Cancelamento
          </button>

          <div class="mensagem-cancelamento"></div>
        </div>
      `
      : gerarAvisoCancelamentoIndisponivel(permuta);

    html += `
      <div class="card-permuta">
        <div class="data">${escaparHtml(dataServicoTexto)}</div>

        <div class="linha-permuta">
          <span class="rotulo">Entra:</span> ${escaparHtml(militarEntra)}
        </div>

        <div class="linha-permuta">
          <span class="rotulo">Sai:</span> ${escaparHtml(militarSai)}
        </div>

        <div class="status ${classeStatus}">
          ${escaparHtml(permuta.status || "PENDENTE")}
        </div>

        ${botaoCancelar}
      </div>
    `;
  });

  resultadoConsulta.innerHTML = html;
}

async function consultarHistoricoPermutas() {
  const rg = limparRG(rgHistorico.value);

  resultadoHistorico.innerHTML = "";

  if (rg.length < 4) {
    resultadoHistorico.innerHTML =
      '<div class="mensagem-consulta">Informe um RG válido para consultar.</div>';
    return;
  }

  btnConsultarHistorico.disabled = true;
  btnConsultarHistorico.textContent = "Consultando...";

  try {
    const resultado = await chamarApi("consultarHistoricoPermutas", {
      rg: rg,
      rgConsulta: rg
    });

    const resposta = resultado.resposta || resultado;
    const permutas = Array.isArray(resposta) ? resposta : (resposta.permutas || []);

    exibirHistoricoPermutas(permutas);

  } catch (erro) {
    resultadoHistorico.innerHTML =
      '<div class="mensagem-consulta">' + escaparHtml(erro.message) + '</div>';
  } finally {
    btnConsultarHistorico.disabled = false;
    btnConsultarHistorico.textContent = "Consultar Histórico";
  }
}

function exibirHistoricoPermutas(permutas) {
  if (!permutas || permutas.length === 0) {
    resultadoHistorico.innerHTML =
      '<div class="mensagem-consulta">Nenhuma permuta encontrada nos últimos 40 dias para este RG.</div>';
    return;
  }

  resultadoHistorico.innerHTML = permutas.map((permuta) => {
    const classeStatus = obterClasseStatus(permuta.status);
    const dataServicoTexto = permuta.dataServico || permuta.data || permuta.dataServicoFormatada || "";
    const militarEntra = permuta.militarEntra || permuta.nomeEntra || permuta.entra || "";
    const militarSai = permuta.militarSai || permuta.nomeSai || permuta.sai || "";
    const motivoCancelamento = String(
      permuta.motivoCancelamento ||
      permuta.motivoDoCancelamento ||
      permuta.cancelamento ||
      ""
    ).trim();

    const motivoHtml = motivoCancelamento
      ? `
        <div class="motivo-cancelamento-historico">
          <span class="rotulo">Motivo do cancelamento:</span>
          ${escaparHtml(motivoCancelamento)}
        </div>
      `
      : "";

    return `
      <div class="card-permuta card-historico">
        <div class="data">${escaparHtml(dataServicoTexto)}</div>

        <div class="linha-permuta">
          <span class="rotulo">Entra:</span> ${escaparHtml(militarEntra)}
        </div>

        <div class="linha-permuta">
          <span class="rotulo">Sai:</span> ${escaparHtml(militarSai)}
        </div>

        <div class="status ${classeStatus}">
          ${escaparHtml(permuta.status || "PENDENTE")}
        </div>

        ${motivoHtml}
      </div>
    `;
  }).join("");
}

function verificarPodeCancelar(valor) {
  const texto = String(valor || "").trim().toUpperCase();

  return (
    valor === true ||
    texto === "TRUE" ||
    texto === "VERDADEIRO" ||
    texto === "SIM" ||
    texto === "1"
  );
}

function gerarAvisoCancelamentoIndisponivel(permuta) {
  const motivo = String(
    permuta.motivoBloqueioCancelamento ||
    permuta.motivoBloqueio ||
    "Entre em contato com a administração."
  ).trim();

  return `
    <div class="aviso-cancelamento-indisponivel">
      Cancelamento indisponível: ${escaparHtml(motivo)}
    </div>
  `;
}

function obterClasseStatus(status) {
  const texto = String(status || "").trim().toUpperCase();

  if (texto === "AUTORIZADA" || texto === "FEITO") return "status-feito";
  if (texto === "CANCELADA") return "status-cancelada";

  return "status-pendente";
}

function escaparHtml(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatarDataBrasileira(dataIso) {
  const partes = String(dataIso || "").split("-");

  if (partes.length !== 3) return escaparHtml(dataIso);

  return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function tentarProcessarPermuta(linha, tentativa) {
  const atraso = tentativa === 1 ? 1500 : 6000;

  setTimeout(() => {
    chamarApi("processarPermutaPendente", {
      linha: linha
    })
      .then((resultadoProcessamento) => {
        console.log("Retorno do processamento complementar:", resultadoProcessamento);

        const respostaProcessamento = resultadoProcessamento.resposta || {};

        if (respostaProcessamento.pendente && tentativa < 2) {
          console.log("Processamento ocupado. Tentando novamente...");
          tentarProcessarPermuta(linha, tentativa + 1);
        }
      })
      .catch((erro) => {
        console.log("Erro no processamento complementar:", erro.message);

        if (tentativa < 2) {
          tentarProcessarPermuta(linha, tentativa + 1);
        }
      });
  }, atraso);
}

function validarEmailCancelamento(rgConsultado, email) {
  const emailNormalizado = normalizarEmail(email);

  if (!emailNormalizado) {
    return "Informe o e-mail cadastrado para o RG consultado.";
  }

  const militarConsultado = militaresPorRG[rgConsultado];
  const emailsCadastrados = obterEmailsMilitar(militarConsultado);

  if (emailsCadastrados.length > 0 && !emailsCadastrados.includes(emailNormalizado)) {
    return "O e-mail informado não pertence ao RG consultado. Informe o e-mail cadastrado para esse militar.";
  }

  return "";
}

function montarPayloadCancelamento(params, dadosExtras = {}) {
  const linha = String(params.linha || "").trim();
  const idPermuta = String(params.idPermuta || linha || "").trim();
  const rgConsultado = limparRG(params.rgConsulta || ultimoRgConsultado || rgConsulta.value);

  return {
    linha: linha,
    row: linha,
    idPermuta: idPermuta,
    id: idPermuta,
    rgConsulta: rgConsultado,
    rg: rgConsultado,
    ...dadosExtras
  };
}

async function solicitarCodigoCancelamento(params, rgConsultaCancelamento) {
  if (!params || typeof params !== "object") {
    params = {
      chave: params,
      linha: params,
      idPermuta: params,
      rgConsulta: rgConsultaCancelamento
    };
  }

  const area = document.getElementById("cancelamento-" + params.chave);

  if (!area) return;

  const emailInput = area.querySelector(".email-cancelamento");
  const mensagemCancelamento = area.querySelector(".mensagem-cancelamento");
  const botao = area.querySelector(".botao-enviar-codigo");

  const email = normalizarEmail(emailInput.value);
  const rgConsultado = limparRG(params.rgConsulta || ultimoRgConsultado || rgConsulta.value);

  mensagemCancelamento.textContent = "";
  mensagemCancelamento.className = "mensagem-cancelamento";

  if (!rgConsultado) {
    mensagemCancelamento.textContent = "RG da consulta não identificado. Atualize a consulta e tente novamente.";
    mensagemCancelamento.classList.add("erro");
    return;
  }

  const erroEmail = validarEmailCancelamento(rgConsultado, email);

  if (erroEmail) {
    mensagemCancelamento.textContent = erroEmail;
    mensagemCancelamento.classList.add("erro");
    return;
  }

  botao.disabled = true;
  botao.textContent = "Enviando...";

  try {
    const resultado = await chamarApi("solicitarCodigoCancelamentoPermuta", montarPayloadCancelamento(params, {
      email: email,
      emailConfirmacao: email
    }));

    mensagemCancelamento.textContent =
      resultado.mensagem || "Código enviado para o e-mail cadastrado no RG consultado.";
    mensagemCancelamento.classList.add("sucesso");

  } catch (erro) {
    mensagemCancelamento.textContent = erro.message;
    mensagemCancelamento.classList.add("erro");

  } finally {
    botao.disabled = false;
    botao.textContent = "Enviar Código";
  }
}

async function confirmarCancelamento(params, rgConsultaCancelamento) {
  if (!params || typeof params !== "object") {
    params = {
      chave: params,
      linha: params,
      idPermuta: params,
      rgConsulta: rgConsultaCancelamento
    };
  }

  const area = document.getElementById("cancelamento-" + params.chave);

  if (!area) return;

  const emailInput = area.querySelector(".email-cancelamento");
  const codigoInput = area.querySelector(".codigo-cancelamento");
  const mensagemCancelamento = area.querySelector(".mensagem-cancelamento");
  const botao = area.querySelector(".botao-confirmar-cancelamento");

  const email = normalizarEmail(emailInput.value);
  const codigo = String(codigoInput.value || "").replace(/\D/g, "").slice(0, 6);
  const rgConsultado = limparRG(params.rgConsulta || ultimoRgConsultado || rgConsulta.value);

  codigoInput.value = codigo;
  mensagemCancelamento.textContent = "";
  mensagemCancelamento.className = "mensagem-cancelamento";

  if (!rgConsultado) {
    mensagemCancelamento.textContent = "RG da consulta não identificado. Atualize a consulta e tente novamente.";
    mensagemCancelamento.classList.add("erro");
    return;
  }

  const erroEmail = validarEmailCancelamento(rgConsultado, email);

  if (erroEmail) {
    mensagemCancelamento.textContent = erroEmail;
    mensagemCancelamento.classList.add("erro");
    return;
  }

  if (!codigo) {
    mensagemCancelamento.textContent = "Informe o código recebido por e-mail.";
    mensagemCancelamento.classList.add("erro");
    return;
  }

  botao.disabled = true;
  botao.textContent = "Confirmando...";

  try {
    const resultado = await chamarApi("confirmarCancelamentoPermuta", montarPayloadCancelamento(params, {
      email: email,
      emailConfirmacao: email,
      codigo: codigo
    }));

    mensagemCancelamento.textContent =
      resultado.mensagem || "Cancelamento registrado com sucesso.";
    mensagemCancelamento.classList.add("sucesso");

    setTimeout(() => {
      consultarPermutasFuturas();
    }, 1200);

  } catch (erro) {
    mensagemCancelamento.textContent = erro.message;
    mensagemCancelamento.classList.add("erro");

  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar Cancelamento";
  }
}
