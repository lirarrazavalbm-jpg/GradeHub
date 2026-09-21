#!/usr/bin/env node
/*
 * Captura acotada y manual del benchmark UC. No descubre cursos ni recorre el
 * catálogo: solo consulta esta lista explícita, de a una petición, con pausa,
 * timeout y un único reintento. Antes de la corrida del 2026-09-21 se revisó
 * https://catalogo.uc.cl/robots.txt: /index.php no está bloqueado.
 *
 * No se ejecuta en CI. Sirve únicamente para renovar conscientemente las
 * fuentes oficiales congeladas del benchmark.
 */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..');
const DEST=path.join(ROOT,'tests','fixtures','catalogo-uc-benchmark');
const BASE='https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=';
const COURSES=[
  ['IIC1103','Introducción a la Programación'],['FIS1514','Dinámica'],['QIM100F','Química'],['BIO143M','Principios Ecológicos y Medio Ambiente'],
  ['MAT1610','Cálculo I'],['EAE1110','Introducción a la Microeconomía'],['EAA100A','Horizontes y Desafíos en la Gestión de Empresas'],
  ['FIL001','Platón'],['TTF013','Tópicos de Ética Social Cristiana'],['ARQ2000','Investigación en Artes y Humanidades'],
  ['DER002C','Personas y Bienes'],['MED101A','Anatomía y Embriología Humana I'],['ENF043A','Cuidados de la Persona Enferma'],
  ['PSI1101','Procesos Psicológicos Básicos'],['LET0003','Desarrollo de Habilidades Comunicativas para Ingenieros'],
  ['COM001','Comunicación y Educación'],['EDU0010','Tecnología de Información y Comunicación en Educación'],
  ['ART001','Dibujo Figura Humana Básico'],['GEO1002','Introducción a la Geografía'],['AGL007','Taller de Biohuerto'],
  ['ICH1104','Mecánica de Fluidos'],['ICE1513','Estática y Dinámica'],['FIS1503','Física General'],['QIM100','Química General'],
  ['BIO141C','Biología de la Célula'],['MAT1620','Cálculo II'],['ICS2563','Econometría Aplicada'],
  ['ICS2121','Métodos de Optimización'],['ICT2904','Ingeniería de Sistemas de Transporte'],['IIC2115','Programación como Herramienta para la Ingeniería'],
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Se conserva el hash de los bytes recibidos, pero el fixture versionado
// normaliza finales de línea y espacios finales. Eso evita ruido de Git sin
// alterar el HTML ni el texto que ve el parser.
function normalizarFixture(bytes){
  const binario=bytes.toString('latin1').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n');
  return Buffer.from(binario,'latin1');
}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
async function get(url){
  let ultimo;
  for(let intento=0;intento<2;intento++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await fetch(url,{signal:controller.signal,headers:{'user-agent':'GradeHubCatalogBenchmark/1.0 (+https://gradehub.cl)','accept':'text/html'}});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }catch(e){ultimo=e;if(intento===0)await wait(1500);}
    finally{clearTimeout(timer);}
  }
  throw ultimo;
}
async function main(){
  fs.mkdirSync(DEST,{recursive:true});
  const manifestPath=path.join(DEST,'sources.json');
  const anteriores=fs.existsSync(manifestPath)
    ? new Map(JSON.parse(fs.readFileSync(manifestPath,'utf8')).sources.map(s=>[s.courseCode,s]))
    : new Map();
  const generatedAt=new Date().toISOString(),sources=[];
  for(let i=0;i<COURSES.length;i++){
    const [courseCode,courseName]=COURSES[i],sourceUrl=BASE+encodeURIComponent(courseCode);
    process.stdout.write(`[${i+1}/${COURSES.length}] ${courseCode} `);
    const anterior=anteriores.get(courseCode);
    if(anterior&&anterior.fixture&&fs.existsSync(path.join(DEST,anterior.fixture))){
      const bytes=fs.readFileSync(path.join(DEST,anterior.fixture));
      const hash=sha(bytes);
      if(anterior.fixtureHash&&hash===anterior.fixtureHash){sources.push(anterior);console.log('REUTILIZADO');continue;}
      if(!anterior.fixtureHash&&hash===anterior.sourceHash){
        const fixtureBytes=normalizarFixture(bytes);
        fs.writeFileSync(path.join(DEST,anterior.fixture),fixtureBytes);
        sources.push({...anterior,fixtureHash:sha(fixtureBytes),fidelity:'normalized_official_html'});
        console.log('NORMALIZADO');continue;
      }
    }
    try{
      const bytes=await get(sourceUrl),fixtureBytes=normalizarFixture(bytes),file=courseCode+'.html',capturedAt=new Date().toISOString();
      fs.writeFileSync(path.join(DEST,file),fixtureBytes);
      sources.push({courseCode,courseName,sourceUrl,capturedAt,sourceHash:sha(bytes),fixtureHash:sha(fixtureBytes),fixture:file,fidelity:'normalized_official_html'});
      console.log('OK');
    }catch(error){sources.push({courseCode,courseName,sourceUrl,capturedAt,error:error.message});console.log('ERROR '+error.message);}
    if(i<COURSES.length-1)await wait(1000);
  }
  fs.writeFileSync(manifestPath,JSON.stringify({sourceUniversity:'Pontificia Universidad Católica de Chile',generatedAt,sources},null,2)+'\n');
  console.log(`Fuentes: ${sources.filter(s=>s.fixture).length}; errores: ${sources.filter(s=>s.error).length}`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
