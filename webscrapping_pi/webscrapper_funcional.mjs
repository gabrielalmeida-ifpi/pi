import * as cheerio from 'cheerio';
import * as fs from 'fs';

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
function carregarEAnalisarPagina(caminhoArquivo, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor) {
    // Verifica se a página já foi visitada
    if (paginasVisitadas.has(caminhoArquivo)) {
        return;
    }

    // Adiciona a página atual ao conjunto de páginas visitadas
    paginasVisitadas.add(caminhoArquivo);

    // Lê o conteúdo do arquivo HTML
    const html = fs.readFileSync(caminhoArquivo, 'utf8');

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
    ocorrenciasTermoBuscado.set(caminhoArquivo, ocorrenciasTermoValor);

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
    ocorrenciasTag.set(caminhoArquivo, ocorrenciasTagValor);

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
        pontosFrescor.set(caminhoArquivo, pontosFrescorValor);
    }

    // Armazenar a pontuação da página no mapa de referências

    // Extrai os links da página atual
    $('a').each((indice, elemento) => {
        const link = $(elemento).attr('href');
        if (link) {
            // Verifica se o link é um arquivo HTML local e se existe
            const caminhoProximaPagina = `${process.cwd()}/${link}`;
            if (fs.existsSync(caminhoProximaPagina)) {
                // Adiciona a página atual como uma referência reversa para a próxima página
                referenciasReversas.set(caminhoProximaPagina, [...(referenciasReversas.get(caminhoProximaPagina) || []), caminhoArquivo]);
                // Carrega e analisa a próxima página recursivamente
                carregarEAnalisarPagina(caminhoProximaPagina, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor);
            } else {
                console.error(`Arquivo ${link} não encontrado.`);
            }
        }
    });
}

// Página inicial
const paginaInicial = `${process.cwd()}/blade_runner.html`;

// Conjunto para armazenar as páginas visitadas
const paginasVisitadas = new Set();

// Mapa para armazenar o número de referências para cada página
const referenciasPagina = new Map();

// Mapa para armazenar as referências reversas (quais páginas apontam para cada página)
const referenciasReversas = new Map();

const perdaPontosAutoreferencia = new Map()

// Mapa para armazenar o número de ocorrências do termo buscado para cada página
const ocorrenciasTermoBuscado = new Map();

// Mapa para armazenar as ocorrências do termo para cada tag em cada página
const ocorrenciasTag = new Map();

// Mapa para armazenar os pontos perdidos/ganhos por frescor para cada página
const pontosFrescor = new Map();

// Termo buscado
const termoBuscado = 'matrix';

// Inicia o processo de carregamento e análise da página inicial
carregarEAnalisarPagina(paginaInicial, paginasVisitadas, referenciasPagina, referenciasReversas, termoBuscado, ocorrenciasTermoBuscado, ocorrenciasTag, pontosFrescor);

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
    const autoridade = referenciasReversas.get(pagina).length * 20;
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
    console.log('Pontos por referência reversa:', referenciasReversas.get(pagina).length * 20);
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
