// ─── MOTOR GRADE HUB (verificado) ───────────────────────────────────────────
// Núcleo de cálculo unificado. Soporta árbol arbitrario + reglas:
// weighted_average · gated_average (ambos hijos ≥ mín) · min_grade_required (piso por hoja).
// FENnotas lo alimenta vía ramoToStructure() (adaptador del modelo categorias→notas).
function gh_excelRound(value,decimals){const f=Math.pow(10,decimals);return Math.sign(value)*Math.round(Math.abs(value)*f)/f;}
function gh_roundFinal(value,meta){if(value===null)return null;const d=meta?.rounding?.decimals??1;return gh_excelRound(value,d);}
function gh_weightOf(node,ov){const o=ov?.[node.id];if(o&&typeof o.weight==='number')return o.weight;return node.weight;}
function gh_meta(s){return s.__meta||{};}
// El recuperativo no es una hoja de la pauta: no tiene peso ni participa en el
// promedio. Se decide sobre la nota FINAL, una vez aplicadas las compuertas.
// `gateLimited` solo bloquea cuando un tope efectivamente BAJÓ la nota hasta el
// rango: una compuerta presente que no cambió el número no inventa una barrera.
function gh_estadoRecuperativo(value,complete,gateLimited,rule,declaration){
  if(!rule||!Number.isFinite(rule.min)||!Number.isFinite(rule.max)||!Number.isFinite(rule.nota))return null;
  const final=gh_roundFinal(value,{rounding:{decimals:1}});
  const base={valor:value,final,regla:rule,declaracion:declaration};
  if(value===null)return {...base,motivo:'sin_nota',puedeDeclarar:false};
  if(!complete)return {...base,motivo:'incompleto',puedeDeclarar:false};
  if(gateLimited)return {...base,motivo:'compuerta',puedeDeclarar:false};
  if(final<rule.min||final>rule.max)return {...base,motivo:'fuera_de_rango',puedeDeclarar:false};
  if(declaration==='aprobado')return {...base,valor:rule.nota,motivo:'aprobado',puedeDeclarar:false};
  if(declaration==='reprobado')return {...base,motivo:'reprobado',puedeDeclarar:false};
  return {...base,motivo:'pendiente',puedeDeclarar:true};
}
// "Se elimina la peor nota", "se elimina el 25% de los controles rendidos": una
// de las reglas más comunes de los programas chilenos, y hasta ahora el motor no
// sabía representarla — quedaba declarada en `noCalcula` para que el estudiante
// supiera que su promedio real podía diferir del que veía.
//
// Solo se descartan evaluaciones YA RENDIDAS. Las que faltan no se pueden
// eliminar: todavía no existe una nota mala que sacar, y descontarlas de
// antemano daría un promedio optimista que después baja solo.
//
// OJO CON EL REDONDEO, que es una decisión y no un dato: con 6 controles el 25%
// da 1,5 y el programa no dice qué pasa ahí. Se usa `floor` —se elimina 1— por
// la misma razón por la que no se inventan ponderaciones: es el único número que
// el documento respalda sin ambigüedad. Por eso `drops` viaja en el resultado,
// para que la interfaz muestre CUÁL nota se eliminó en vez de que el estudiante
// vea un promedio que no le cuadra.
function gh_applyDrop(node,known){
  const d=node.drop_lowest;
  if(!d||known.length<2)return [];
  let k=0;
  if(typeof d.count==='number')k=Math.floor(d.count);
  else if(typeof d.fraction==='number')k=Math.floor(d.fraction*known.length);
  if(k<=0)return [];
  // Nunca se descartan todas: si la regla se comiera el grupo entero, el
  // promedio pasaría a null y la categoría desaparecería del cálculo con su
  // ponderación repartida entre las demás. Eso no es "eliminar la peor nota".
  k=Math.min(k,known.length-1);
  const peores=new Set(known.slice().sort((a,b)=>a.value-b.value).slice(0,k));
  const fuera=[];
  for(let i=known.length-1;i>=0;i--){if(peores.has(known[i]))fuera.unshift(known.splice(i,1)[0]);}
  return fuera;
}

// Una inasistencia justificada no es una nota inventada. La regla del programa
// puede decir dos cosas distintas: reemplazar la nota ausente por otra ya
// rendida, o mover un peso completo a otra evaluación. El adaptador recibe ids
// resueltos desde el preset, por lo que este motor no sabe ni necesita saber el
// nombre del ramo que está calculando.
function gh_clonarArbol(node){return {...node,children:(node.children||[]).map(gh_clonarArbol)};}
function gh_nodosPorId(node,map=new Map()){map.set(node.id,node);(node.children||[]).forEach(hijo=>gh_nodosPorId(hijo,map));return map;}
function gh_prepararAusenciasJustificadas(structure,grades,regla,declaraciones){
  const declaradas=new Set(Array.isArray(declaraciones)?declaraciones:[]);
  const vacio={estructura:structure,notas:grades,activas:[],pendientes:[],inactivas:[]};
  if(!regla||!declaradas.size)return vacio;
  const base=calculateFinalGrade(structure,grades);
  const valores=new Map(base.breakdown.map(n=>[n.id,n.value]));
  const copia=gh_clonarArbol(structure),nodos=gh_nodosPorId(copia),notas={...grades};
  const activas=[],pendientes=[],inactivas=[],vistas=new Set();
  const revisar=(tipo,entrada)=>{
    if(!entrada||!declaradas.has(entrada.desdeId)||vistas.has(entrada.desdeId))return;
    vistas.add(entrada.desdeId);
    const desde=nodos.get(entrada.desdeId),hacia=nodos.get(entrada.haciaId);
    if(!desde||!hacia){inactivas.push({...entrada,tipo,motivo:'pauta_cambio'});return;}
    if(valores.get(entrada.desdeId)!==null){inactivas.push({...entrada,tipo,motivo:'tiene_nota'});return;}
    if(tipo==='reemplazo'&&valores.get(entrada.haciaId)==null){pendientes.push({...entrada,tipo,motivo:'falta_destino'});return;}
    if(tipo==='reemplazo'){
      const id=`ausencia-${entrada.desdeId}`;
      desde.children=[{id,name:'Nota reemplazada',weight:1,type:'leaf'}];
      desde.drop_lowest=null;notas[id]=valores.get(entrada.haciaId);
    }else{
      hacia.weight=(Number(hacia.weight)||0)+(Number(desde.weight)||0);
      desde.weight=0;desde.children=[];desde.drop_lowest=null;
    }
    activas.push({...entrada,tipo});
  };
  (regla.reemplazos||[]).forEach(entrada=>revisar('reemplazo',entrada));
  (regla.traspasos||[]).forEach(entrada=>revisar('traspaso',entrada));
  declaradas.forEach(desdeId=>{if(!vistas.has(desdeId))inactivas.push({desdeId,tipo:'desconocida',motivo:'pauta_cambio'});});
  return {estructura:copia,notas,activas,pendientes,inactivas};
}
function calculateFinalGrade(structure,grades,overrides={}){
  const breakdown=[],emptyLeaves=[],gates=[],drops=[];
  function evalNode(node){
    if(node.type==='leaf'){const g=grades[node.id];const value=(typeof g==='number')?g:null;breakdown.push({id:node.id,name:node.name,value,complete:value!==null});return {value,complete:value!==null};}
    let known=[],allComplete=true;
    for(const c of node.children){const cr=evalNode(c);if(!cr.complete)allComplete=false;if(cr.value!==null)known.push({child:c,value:cr.value,complete:cr.complete,weight:gh_weightOf(c,overrides)});}
    const fuera=gh_applyDrop(node,known);
    if(fuera.length)drops.push({nodeId:node.id,name:node.name,dropped:fuera.map(f=>({id:f.child.id,name:f.child.name,value:f.value})),rendidas:known.length+fuera.length});
    let sumW=0,acc=0;
    for(const k of known){acc+=k.value*k.weight;sumW+=k.weight;}
    let value=sumW>0?acc/sumW:null;
    if(node.aggregation_rule==='gated_average'&&value!==null){const p=node.rule_params||{};const off=known.filter(k=>k.value<p.min_required);const locked=off.filter(o=>o.complete);const ok=off.length===0;gates.push({nodeId:node.id,kind:'gated_average',ok,min_required:p.min_required,fail_cap:p.fail_cap,offenders:off.map(o=>o.child.name),lockedOffenders:locked.map(o=>o.child.name),pending:known.length<node.children.length});if(!ok)value=Math.min(value,p.fail_cap);}
    breakdown.push({id:node.id,name:node.name,value,complete:allComplete});return {value,complete:allComplete};
  }
  let rootValue=evalNode(structure).value;
  const effW=gh_effWeights(structure,overrides);
  gh_collectEmpty(structure,grades,effW,emptyLeaves);
  gh_leafGates(structure,grades,(gate)=>{gates.push(gate);if(!gate.ok&&rootValue!==null)rootValue=Math.min(rootValue,gate.fail_cap);});
  return {value:gh_roundFinal(rootValue,gh_meta(structure)),raw:rootValue,complete:emptyLeaves.length===0,breakdown,emptyLeaves,gates,drops};
}
function gh_effWeights(structure,overrides={}){const eff={};function walk(node,pw){if(node.type==='leaf'){eff[node.id]=pw;return;}const total=node.children.reduce((s,c)=>s+gh_weightOf(c,overrides),0);for(const c of node.children){const norm=total>0?gh_weightOf(c,overrides)/total:0;walk(c,pw*norm);}}walk(structure,1);return eff;}
function gh_collectEmpty(structure,grades,effW,out){function walk(node){if(node.type==='leaf'){if(typeof grades[node.id]!=='number')out.push({id:node.id,name:node.name,effectiveWeight:effW[node.id]});return;}node.children.forEach(walk);}walk(structure);}
function gh_leafGates(structure,grades,emit){function walk(node){if(node.type==='leaf'){if(typeof node.min_grade_required==='number'){const g=grades[node.id];const known=typeof g==='number';const ok=!known||g>=node.min_grade_required;emit({nodeId:node.id,kind:'min_grade_required',ok,min_required:node.min_grade_required,fail_cap:node.fail_cap,pending:!known,current:known?g:null,name:node.name});}return;}node.children.forEach(walk);}walk(structure);}
function gh_hasPendingLeaf(node,grades){return node.type==='leaf'?typeof grades[node.id]!=='number':node.children.some(c=>gh_hasPendingLeaf(c,grades));}
function gh_hasPendingDrop(node,grades){
  if(node.type==='leaf')return false;
  return (!!node.drop_lowest&&gh_hasPendingLeaf(node,grades))||node.children.some(c=>gh_hasPendingDrop(c,grades));
}
function gh_projectGrades(grades,emptyLeaves,value){
  const projected={...grades};
  emptyLeaves.forEach(l=>{projected[l.id]=value;});
  return projected;
}
function solveForTarget(structure,grades,target,overrides={},options={}){
  // La interfaz distingue 7 de 7,001: el adaptador puede pedir el resultado
  // sin redondear y extender la búsqueda para explicar una meta inalcanzable.
  const requiredValue=n=>options.precision===null?n:gh_excelRound(n,2);
  const meta=gh_meta(structure);const scaleMin=meta?.grade_scale?.min??1.0,scaleMax=meta?.grade_scale?.max??7.0;
  const direct=calculateFinalGrade(structure,grades,overrides);const effW=gh_effWeights(structure,overrides);
  let known=0;for(const id in grades){if(typeof grades[id]==='number'&&effW[id]!=null)known+=grades[id]*effW[id];}
  const remainingWeight=direct.emptyLeaves.reduce((s,l)=>s+l.effectiveWeight,0);
  const conditions=[],gateWarnings=[];
  for(const g of direct.gates){
    if(g.kind==='gated_average'&&g.lockedOffenders&&g.lockedOffenders.length>0)gateWarnings.push(`${g.lockedOffenders.join(', ')} ya quedó bajo ${g.min_required} y está completo: la nota queda topada en ${g.fail_cap}.`);
    if(g.kind==='min_grade_required'&&!g.ok&&!g.pending)gateWarnings.push(`${g.name} quedó en ${g.current} (mín. ${g.min_required}): nota topada en ${g.fail_cap}.`);
    if(g.kind==='gated_average'&&g.pending&&(!g.lockedOffenders||g.lockedOffenders.length===0))conditions.push(`Cada componente con compuerta debe terminar en ≥ ${g.min_required}.`);
    if(g.kind==='min_grade_required'&&g.pending)conditions.push(`${g.name} debe ser ≥ ${g.min_required} (si no, repruebas pese al promedio).`);
  }
  if(remainingWeight===0){const reached=direct.raw;return {feasible:reached>=target&&gateWarnings.length===0,requiredAverage:null,emptyLeaves:direct.emptyLeaves,message:gateWarnings.length?`Curso completo, con tope por compuerta. Nota final: ${direct.value}.`:(reached>=target?`Ya alcanzaste ${target}.`:`No quedan evaluaciones; tu nota final es ${direct.value}.`),conditions,gateWarnings,scaleMin,scaleMax,dropAware:false};}
  // Con una nota pendiente en un grupo que descarta la peor, su peso efectivo
  // depende de su propio valor. En vez de fingir un peso fijo, proyectamos la
  // misma nota en todas las pendientes y buscamos el mínimo que llega a meta.
  const dropAware=gh_hasPendingDrop(structure,grades);
  if(dropAware){
    conditions.push('El cálculo supone la misma nota en todas las evaluaciones pendientes y considera que la peor nota del grupo se descarta según la regla del programa.');
    const finalCon=value=>calculateFinalGrade(structure,gh_projectGrades(grades,direct.emptyLeaves,value),overrides).raw;
    const conMax=finalCon(scaleMax);
    if(conMax===null||gateWarnings.length>0||(!options.extrapolate&&conMax<target))return {feasible:false,requiredAverage:gh_excelRound(scaleMax,2),emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
    const conMin=finalCon(scaleMin);
    if(conMin!==null&&conMin>=target)return {feasible:true,requiredAverage:scaleMin,emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
    let lo=scaleMin,hi=scaleMax;
    if(options.extrapolate){
      while(finalCon(hi)<target&&Number.isFinite(hi*2))hi*=2;
    }
    for(let i=0;i<48;i++){
      const mid=(lo+hi)/2;
      if(finalCon(mid)!==null&&finalCon(mid)>=target)hi=mid;else lo=mid;
    }
    return {feasible:hi<=scaleMax,requiredAverage:requiredValue(hi),emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
  }
  const required=(target-known)/remainingWeight;const reqRounded=requiredValue(required);
  const feasible=reqRounded>=scaleMin&&reqRounded<=scaleMax&&gateWarnings.length===0;
  return {feasible,requiredAverage:reqRounded,emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
}

// Adaptador del estado de GradeHub para el núcleo. No lee el DOM ni el estado
// global: la app y, más adelante, una Pages Function entregan sus dependencias.
// Las funciones internas se mantienen junto al motor para que la misma cuenta
// de casillas, descartes, compuertas y ramos vinculados no se reescriba afuera.
function gh_crearCalculoRamo(deps){
  const normName=deps.normName;
  const copiarRecuperativo=deps.copiarRecuperativo;
  const definicionPresetDelRamo=deps.definicionPresetDelRamo;
  const S={get ramos(){return deps.ramos();}};

  function hojasCategoria(c){
    const notas=Array.isArray(c&&c.notas)?c.notas:[];
    const slots=Number.isInteger(c&&c.slots)&&c.slots>1?c.slots:0;
    if(!slots)return notas.map(n=>({id:n.id,name:n.nombre,weight:(n.peso||1),type:'leaf'}));
    const porSlot=new Map(),sinSlot=[];
    notas.forEach(n=>{
      if(Number.isInteger(n.slot)&&n.slot>=0&&n.slot<slots)porSlot.set(n.slot,n);
      else sinSlot.push(n);
    });
    const reales=[...porSlot.values(),...sinSlot];
    const ids=new Set(reales.map(n=>n.id));
    const hojas=reales.map(n=>({id:n.id,name:n.nombre,weight:(n.peso||1),type:'leaf'}));
    for(let slot=0;slot<slots;slot++){
      if(porSlot.has(slot))continue;
      let id=`__gh_pendiente_slot__${c.id}__${slot}`;
      while(ids.has(id))id+='_';
      ids.add(id);
      hojas.push({id,name:`${c.nombre} pendiente ${slot+1}`,weight:1,type:'leaf'});
    }
    return hojas;
  }
  function ramoToStructure(r){
    return {__meta:{grade_scale:{min:1,max:7},rounding:{decimals:2},passing_grade:4.0},
      id:'final',name:r.nombre||'Ramo',type:'group',aggregation_rule:'weighted_average',
      children:categoriasVigentes(r).map(c=>({id:c.id,name:c.nombre,weight:c.peso,type:'group',aggregation_rule:'weighted_average',
        drop_lowest:c.dropLowest||null,
        children:hojasCategoria(c)}))};
  }
  function gradesOf(r){const g={};(r.categorias||[]).forEach(c=>(c.notas||[]).forEach(n=>{if(n.valor!==null&&n.valor!==undefined)g[n.id]=n.valor;}));return g;}
  function avgPond(notas){let tv=0,tp=0;notas.forEach(n=>{if(n.valor!==null){tv+=n.valor*(n.peso||1);tp+=(n.peso||1);}});return tp>0?tv/tp:null;}
  function notasVigentesSinDescarte(cat){
    const notas=(cat&&cat.notas||[]).filter(n=>typeof n.valor==='number');
    if(!(Number.isInteger(cat&&cat.slots)&&cat.slots>1))return notas;
    const porCasilla=new Map();
    notas.forEach(n=>{if(Number.isInteger(n.slot))porCasilla.set(n.slot,n);});
    return porCasilla.size?[...porCasilla.values()]:notas;
  }
  function promedioCompletoSinDescarte(cat){
    const objetivo=Number.isInteger(cat&&cat.slots)&&cat.slots>1?cat.slots:1;
    const notas=(cat&&cat.notas||[]).filter(n=>typeof n.valor==='number');
    const vigentes=notasVigentesSinDescarte(cat);
    const conCasilla=objetivo>1&&vigentes.some(n=>Number.isInteger(n.slot));
    const rendidas=conCasilla?vigentes.length:notas.length;
    if(rendidas<objetivo)return null;
    return avgPond(vigentes);
  }
  function estadoEximicion(ramo){
    const def=definicionPresetDelRamo(ramo);
    const regla=!Array.isArray(def)&&def&&def.eximicion;
    if(!regla||!Array.isArray(regla.segun)||regla.ignoraDescartes!==true)return null;
    const categorias=ramo.categorias||[];
    const examen=categorias.find(c=>normName(c.nombre)===normName(regla.evaluacion));
    if(!examen)return null;
    const confirmada=ramo.eximicionConfirmada===true;
    const base={activa:false,pendiente:false,examenId:examen.id,regla,confirmada};
    if(avgPond(examen.notas)!==null)return {...base,razon:'examen_rendido'};
    const fuentes=regla.segun.map(nombre=>categorias.find(c=>normName(c.nombre)===normName(nombre))).filter(Boolean);
    if(fuentes.length!==regla.segun.length)return null;
    const promedios=fuentes.map(promedioCompletoSinDescarte);
    if(promedios.some(p=>p===null))return {...base,pendiente:true,razon:'incompleto'};
    const pesoTotal=fuentes.reduce((s,c)=>s+(Number(c.peso)||0),0);
    const promedio=pesoTotal>0?fuentes.reduce((s,c,i)=>s+promedios[i]*(Number(c.peso)||0),0)/pesoTotal:null;
    const minimoFallido=(Array.isArray(regla.minimos)?regla.minimos:[]).find(condicion=>{
      const cat=categorias.find(c=>normName(c.nombre)===normName(condicion.evaluacion));
      if(!cat||!Number.isFinite(condicion.min))return true;
      if(condicion.cadaNota===true){
        const notas=notasVigentesSinDescarte(cat);
        return !notas.length||notas.some(n=>n.valor<condicion.min);
      }
      const valor=promedioCompletoSinDescarte(cat);
      return valor===null||valor<condicion.min;
    });
    if(minimoFallido)return {...base,promedio,razon:'minimo_categoria',minimoFallido};
    const elegible=promedio!==null&&promedio>=regla.min;
    const requiereConfirmacion=regla.requiereConfirmacion===true;
    const activa=elegible&&(!requiereConfirmacion||confirmada);
    return {...base,activa,elegible,promedio,
      puedeConfirmar:elegible&&requiereConfirmacion&&!confirmada,
      razon:!elegible?'promedio':activa?'cumple':'falta_confirmacion'};
  }
  function categoriaEximida(ramo,cat){const estado=estadoEximicion(ramo);return !!(estado&&estado.activa&&estado.examenId===cat.id);}
  function categoriasVigentes(ramo){return (ramo&&ramo.categorias||[]).filter(c=>!categoriaEximida(ramo,c));}
  function estadoAusenciasJustificadas(ramo){
    if(!ramo||!ramo.reglasAusenciaJustificada)return null;
    return gh_prepararAusenciasJustificadas(ramoToStructure(ramo),gradesOf(ramo),ramo.reglasAusenciaJustificada,ramo.ausenciasJustificadas);
  }
  function avgDeGrupo(r,catIds){
    const set=new Set(catIds||[]);
    let num=0,den=0;
    (r.categorias||[]).forEach(c=>{
      if(!set.has(c.id))return;
      const a=avgPond(c.notas);
      if(a===null)return;
      num+=a*(c.peso||0);den+=(c.peso||0);
    });
    return den>0?num/den:null;
  }
  function avgDeGrupoCalculado(res,estructura,catIds){
    const valores=new Map((res.breakdown||[]).map(n=>[n.id,n.value]));
    const nodos=new Map((estructura.children||[]).map(n=>[n.id,n]));
    let num=0,den=0;
    (catIds||[]).forEach(id=>{
      const peso=Number((nodos.get(id)||{}).weight)||0,valor=valores.get(id);
      if(peso>0&&valor!==null&&valor!==undefined){num+=valor*peso;den+=peso;}
    });
    return den>0?num/den:null;
  }
  function calculoRamoConCompuertas(r){
    const ausencias=estadoAusenciasJustificadas(r);
    const estructura=ausencias?ausencias.estructura:ramoToStructure(r);
    const notas=ausencias?ausencias.notas:gradesOf(r);
    const res=calculateFinalGrade(estructura,notas);
    let v=res.raw,limitadoPorCompuerta=false;
    if(v!==null && Array.isArray(r.gates)){
      for(const g of r.gates){
        if(g.type==='min_grade_required'){
          const node=res.breakdown.find(b=>b.id===g.catId);
          if(node && node.value!==null && node.value < g.min){
            const siguiente=Math.min(v,g.cap);if(siguiente<v)limitadoPorCompuerta=true;v=siguiente;
          }
        } else if(g.type==='group_min'){
          const ga=avgDeGrupoCalculado(res,estructura,g.catIds);
          if(ga!==null && ga < g.min){
            const tope=(g.cap==='self')?ga:g.cap;
            const siguiente=Math.min(v,tope);if(siguiente<v)limitadoPorCompuerta=true;v=siguiente;
          }
        }
      }
    }
    return {res,valor:v,limitadoPorCompuerta,estructura,notas,ausencias};
  }
  function ramoCompletamenteEvaluado(r,calculo){
    const cubiertas=new Set((calculo&&calculo.ausencias&&calculo.ausencias.activas||[]).map(x=>x.desdeId));
    const categorias=categoriasVigentes(r);
    return categorias.length>0&&categorias.every(c=>{
      if(cubiertas.has(c.id))return true;
      const objetivo=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
      return (c.notas||[]).filter(n=>typeof n.valor==='number').length>=objetivo;
    });
  }
  function estadoRecuperativo(r,calculo){
    const regla=copiarRecuperativo(r&&r.recuperativo);if(!regla)return null;
    const base=calculo||calculoRamoConCompuertas(r);
    return gh_estadoRecuperativo(base.valor,ramoCompletamenteEvaluado(r,base),base.limitadoPorCompuerta,regla,r.recuperativoRendido);
  }
  function resumenCategoriasCalculadas(r,calculo){
    const base=calculo||calculoRamoConCompuertas(r);
    const valores=new Map((base.res.breakdown||[]).map(n=>[n.id,n.value]));
    return (base.estructura.children||[]).filter(c=>(Number(c.weight)||0)>0).map(c=>({id:c.id,nombre:c.name,peso:Number(c.weight)||0,valor:valores.get(c.id)}));
  }
  function ramoAvg(r,visitados,ramosContexto){
    // Las correcciones manuales solo viven en un ramo archivado. Si falta la
    // caché del semestre, siguen siendo el resultado que la persona confirmó.
    if(r&&typeof r.avgOverride==='number'&&Number.isFinite(r.avgOverride))return r.avgOverride;
    const base=calculoRamoConCompuertas(r);
    const recuperativo=estadoRecuperativo(r,base);
    const v=recuperativo?recuperativo.valor:base.valor;
    return combinarConRamoVinculado(r,v,visitados,ramosContexto);
  }
  function ramoVinculado(r,ramosContexto){
    if(!r||!r.aporta||!r.aporta.ramo)return null;
    const objetivo=normName(r.aporta.ramo);
    return (ramosContexto||S.ramos||[]).find(x=>x!==r&&normName(x.nombre)===objetivo)||null;
  }
  function combinarConRamoVinculado(r,propio,visitados,ramosContexto){
    const link=r&&r.aporta;
    if(!link||propio===null)return propio;
    const vistos=visitados||new Set();
    if(vistos.has(r.id))return propio;
    vistos.add(r.id);
    const otro=ramoVinculado(r,ramosContexto);
    if(!otro)return propio;
    const externo=ramoAvg(otro,vistos,ramosContexto);
    if(externo===null)return propio;
    const p=(link.peso||0)/100;
    let v=propio*(1-p)+externo*p;
    if(typeof link.min==='number'&&(propio<link.min||externo<link.min))v=Math.min(propio,externo);
    return v;
  }
  function gatesActivas(r){
    const calculo=calculoRamoConCompuertas(r);
    const valores=new Map((calculo.res.breakdown||[]).map(n=>[n.id,n.value]));
    const out=[];
    (r.gates||[]).forEach(g=>{
      if(g.type==='min_grade_required'){
        const c=(r.categorias||[]).find(x=>x.id===g.catId);
        if(!c)return;
        const a=valores.get(c.id);
        if(a!==null&&a<g.min)out.push({nombre:g.nombre||c.nombre,actual:a,min:g.min,cap:g.cap});
      } else if(g.type==='group_min'){
        const ga=avgDeGrupoCalculado(calculo.res,calculo.estructura,g.catIds);
        if(ga!==null&&ga<g.min){
          out.push({nombre:g.nombre||'Requisito',actual:ga,min:g.min,cap:(g.cap==='self')?ga:g.cap,grupo:true});
        }
      }
    });
    return out;
  }
  function estadoParaNotaNecesaria(ramo){
    const categorias=categoriasVigentes(ramo);
    const total=categorias.reduce((s,c)=>s+(Number(c.peso)||0),0);
    if(total<=0)return {total:0,conocido:0,pendiente:0};
    const estructura=ramoToStructure(ramo),notas=gradesOf(ramo);
    const pesos=gh_effWeights(estructura);
    const valores=new Map(resumenCategoriasCalculadas(ramo).map(c=>[c.id,c.valor]));
    let conocido=0,pesoConocido=0;
    categorias.forEach(c=>{
      const slots=Number.isInteger(c.slots)&&c.slots>1;
      if(!slots){
        const valor=valores.get(c.id),peso=Number(c.peso)||0;
        if(typeof valor==='number'){conocido+=valor*peso;pesoConocido+=peso;}
        return;
      }
      const grupo=estructura.children.find(h=>h.id===c.id);
      (grupo?.children||[]).forEach(hoja=>{
        const valor=notas[hoja.id],peso=(pesos[hoja.id]||0)*total;
        if(typeof valor==='number'){conocido+=valor*peso;pesoConocido+=peso;}
      });
    });
    return {total,conocido:conocido/total,pendiente:Math.max(0,1-pesoConocido/total)};
  }
  function notaNecesaria(ramo,meta){
    const objetivo=Number.isFinite(meta)?meta:4.0;
    const notas={};
    function preparar(r,prefijo){
      const base=calculoRamoConCompuertas(r);
      const valores=new Map(base.res.breakdown.map(n=>[n.id,n.value]));
      const categorias=new Map(categoriasVigentes(r).map(c=>[c.id,c]));
      function copiar(node){
        const id=prefijo+node.id;
        if(typeof base.notas[node.id]==='number')notas[id]=base.notas[node.id];
        return {...node,id,...(node.children?{children:node.children.map(copiar)}:{})};
      }
      return {...base.estructura,children:base.estructura.children.map(node=>{
        const cat=categorias.get(node.id),valor=valores.get(node.id);
        // Una lista sin cantidad declarada conserva su promedio conocido. Un
        // grupo completo conserva su descarte ya calculado, no sus pesos brutos.
        if(!(cat&&cat.slots>1)||!gh_hasPendingLeaf(node,base.notas)){
          const id=prefijo+node.id;
          if(typeof valor==='number')notas[id]=valor;
          return {id,name:node.name,weight:node.weight,type:'leaf'};
        }
        return copiar(node);
      })};
    }
    const propio=preparar(ramo,'propio:');
    if(!propio.children.some(c=>c.weight>0))return null;
    let estructura=propio;
    const link=ramo.aporta;
    if(link&&link.peso){
      const p=link.peso/100;
      const otro=ramoVinculado(ramo);
      const externo=otro?preparar(otro,'externo:'):{id:'externo',name:link.ramo,type:'leaf'};
      estructura={...propio,children:[{...propio,id:'propio',weight:1-p},{...externo,id:'externo',weight:p}]};
    }
    // Las compuertas se siguen comunicando por gatesActivas; acá se obtiene la
    // exigencia ponderada. Solo el solver decide cómo cambia el descarte al rendir.
    return solveForTarget(estructura,notas,objetivo,{}, {precision:null,extrapolate:true}).requiredAverage;
  }
  return {hojasCategoria,ramoToStructure,gradesOf,avgPond,promedioCompletoSinDescarte,estadoEximicion,categoriaEximida,categoriasVigentes,estadoAusenciasJustificadas,avgDeGrupo,avgDeGrupoCalculado,calculoRamoConCompuertas,ramoCompletamenteEvaluado,estadoRecuperativo,resumenCategoriasCalculadas,ramoAvg,ramoVinculado,combinarConRamoVinculado,gatesActivas,estadoParaNotaNecesaria,notaNecesaria};
}

if(typeof module!=='undefined'&&module.exports)module.exports={gh_crearCalculoRamo};
