import * as cheerio from 'cheerio';
import * as fs from 'fs';
import axios from 'axios';

// Função para encontrar ocorrências de um termo em uma tag específica
function encontrarOcorrencias(tag, termo, $) {
    if (tag === 'meta') {
        let metaOcorrencias = 0;
        $(tag).each(function () {
            const conteudo = $(this).attr('content');
            if (conteudo && conteudo.toLowerCase().includes(termo.toLowerCase())) {
                metaOcorrencias++;
            }
        });
        return metaOcorrencias;
    } else {
        const conteudo = $(tag).text();
        if (conteudo) {
            const regex = new RegExp(termo, 'gi');
            const ocorrencias = conteudo.match(regex);
            return ocorrencias ? ocorrencias.length : 0;
        }
    }
    return 0;
}

// Função para carregar e analisar uma página HTML
async function carregarEAnalisarPagina(url, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor) {
    // Verifica se a página já foi visitada
    if (paginasVisitadas.has(url)) {
        return;
    }

    // Adiciona a página atual ao conjunto de páginas visitadas
    paginasVisitadas.add(url);

    // Faz a solicitação HTTP para obter o conteúdo HTML
    const response = await axios.get(url);
    const html = response.data;

    // Carrega o HTML usando Cheerio
    const $ = cheerio.load(html);

    
    // Quantidade dos Termos Buscados (Pontuação por ocorrência de termos buscados)
    let ocorrenciasTermo = $('html').text().toLowerCase().split(termoBuscado.toLowerCase()).length - 1;
    $($('meta')).each(function () {
        const conteudo = $(this).attr('content');
        if (conteudo && conteudo.toLowerCase().includes(termoBuscado.toLowerCase())) {
            ocorrenciasTermo++;
        }
    });
    let ocorrenciasTermoValor = ocorrenciasTermo * 5;
    ocorrenciasTermoBuscado.set(url, ocorrenciasTermoValor);

    // Uso das Tags (Pontuação por uso dos termos buscados em tags específicas)
    const pontosTags = {
        'title': 20,
        'meta': 20,
        'h1': 15,
        'h2': 10,
        'p': 5,
        'a': 2
    };
    let ocorrenciasTagValor = 0;
    Object.keys(pontosTags).forEach(tag => {
        const ocorrenciasTag = encontrarOcorrencias(tag, termoBuscado, $);
        ocorrenciasTagValor += ocorrenciasTag * pontosTags[tag];
    });
    ocorrenciasTag.set(url, ocorrenciasTagValor);

    // Frescor do Conteúdo (Pontuação baseada na data de publicação da página)
    const regexData = /(\d{2}\/\d{2}\/\d{4})/; // Regex para encontrar a data no formato "DD/MM/YYYY"
    const correspondenciaData = $('body').text().match(regexData);
    if (correspondenciaData) {
        const dataPagina = correspondenciaData[1]; // Extrai a data do primeiro match encontrado
        const dataAtual = new Date();
        const anoPublicacaoPagina = parseInt(dataPagina.split('/')[2]); // Extrai o ano de publicação da página
        const anoAtual = dataAtual.getFullYear(); // Obtém o ano atual
        const anosDiferenca = anoAtual - anoPublicacaoPagina; // Calcula a diferença em anos
        const pontosFrescorValor = (anosDiferenca === 0) ? 30 : -5 * anosDiferenca;
        pontosFrescor.set(url, pontosFrescorValor);
    }

    // Extrai os links da página atual
    $('a').each(async (indice, elemento) => {
        const link = $(elemento).attr('href');
        if (link) {
            // Verifica se o link é uma URL válida e absoluta
            const linkAbsoluto = new URL(link, url).href;
            if (linkAbsoluto.startsWith('http')) {
                // Adiciona a página atual como uma referência para a próxima página
                referenciasPagina.set(linkAbsoluto, (referenciasPagina.get(linkAbsoluto) || 0) + 1);
                // Adiciona a próxima página como uma referência reversa para a página atual
                referenciasReversas.set(linkAbsoluto, [...(referenciasReversas.get(linkAbsoluto) || []), url]);
                // Carrega e analisa a próxima página recursivamente
                await carregarEAnalisarPagina(linkAbsoluto, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor);
            }
        }
    });

    // Restante do código para análise da página atual permanece o mesmo...
    // ... (não incluído aqui para evitar redundância)
}

// Página inicial
const paginaInicial = 'https://kernel32dev.github.io/hosp-pi/blade_runner.html';

// Conjunto para armazenar as páginas visitadas
const paginasVisitadas = new Set();

// Mapa para armazenar o número de referências para cada página
const referenciasPagina = new Map();

// Mapa para armazenar as referências reversas (quais páginas apontam para cada página)
const referenciasReversas = new Map();

const perdaPontosAutoreferencia = new Map();

// Mapa para armazenar o número de ocorrências do termo buscado para cada página
const ocorrenciasTermoBuscado = new Map();

// Mapa para armazenar as ocorrências do termo para cada tag em cada página
const ocorrenciasTag = new Map();

// Mapa para armazenar os pontos perdidos/ganhos por frescor para cada página
const pontosFrescor = new Map();

// Termo buscado
const termoBuscado = 'matrix';

// Inicia o processo de carregamento e análise da página inicial
carregarEAnalisarPagina(paginaInicial, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor).then(() => {
    //Pontos de Autoridade
    for (let pagina of paginasVisitadas) {
        const referenciasEntrantes = referenciasReversas.get(pagina) || [];
        let pontuacao = referenciasPagina.get(pagina) || 0;
        let pontoPerda = 0;
        for (let link of referenciasEntrantes) {
            if (link == pagina) {
                pontoPerda -= 20;
            }
        }
        pontuacao -= pontoPerda;
        perdaPontosAutoreferencia.set(pagina, pontoPerda);
    }

    for (let pagina of paginasVisitadas) {
        const autoridade = (referenciasReversas.get(pagina) || []).length * 20;
        const ocorrencias = ocorrenciasTermoBuscado.get(pagina) || 0;
        const usoEmTag = ocorrenciasTag.get(pagina);
        const autoreferencia = perdaPontosAutoreferencia.get(pagina);
        const frescura = pontosFrescor.get(pagina) || 0;

        const pontosTotais = autoridade + ocorrencias + usoEmTag + autoreferencia + frescura;
        referenciasPagina.set(pagina, pontosTotais);
    }

    // Ordena as páginas por pontuação
    const paginasOrdenadas = [...referenciasPagina.entries()].sort((a, b) => b[1] - a[1]);

    // Exibe os detalhes de cada página
    console.log('Detalhes das páginas:');
    paginasOrdenadas.forEach(([pagina, pontosTotais], indice) => {
        console.log(`Página ${indice + 1}: ${pagina}`);
        console.log('-----------------------------------');
        console.log('Pontos por referência reversa:', (referenciasReversas.get(pagina) || []).length * 20);
        console.log('Ocorrências do termo buscado:', ocorrenciasTermoBuscado.get(pagina) || 0);
        console.log('Ocorrências do termo por tag:', ocorrenciasTag.get(pagina));
        Object.keys(ocorrenciasTag.get(pagina) || {}).forEach(tag => {
            console.log(`- ${tag}: ${ocorrenciasTag.get(pagina)[tag]}`);
        });
        console.log('Pontos perdidos por autoreferência:', perdaPontosAutoreferencia.get(pagina));
        console.log('Pontos perdidos/ganhos por frescor:', pontosFrescor.get(pagina) || 0);
        console.log('Pontuação total:', pontosTotais);
        console.log('Exibir página:', ocorrenciasTermoBuscado.get(pagina) > 0 ? 'Sim' : 'Não');
        console.log('');
    });
});
