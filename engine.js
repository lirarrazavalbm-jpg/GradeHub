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
function solveForTarget(structure,grades,target,overrides={}){
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
    if(conMax===null||conMax<target||gateWarnings.length>0)return {feasible:false,requiredAverage:gh_excelRound(scaleMax,2),emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
    const conMin=finalCon(scaleMin);
    if(conMin!==null&&conMin>=target)return {feasible:true,requiredAverage:scaleMin,emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
    let lo=scaleMin,hi=scaleMax;
    for(let i=0;i<48;i++){
      const mid=(lo+hi)/2;
      if(finalCon(mid)!==null&&finalCon(mid)>=target)hi=mid;else lo=mid;
    }
    return {feasible:true,requiredAverage:gh_excelRound(hi,2),emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
  }
  const required=(target-known)/remainingWeight;const reqRounded=gh_excelRound(required,2);
  const feasible=reqRounded>=scaleMin&&reqRounded<=scaleMax&&gateWarnings.length===0;
  return {feasible,requiredAverage:reqRounded,emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax,dropAware};
}
