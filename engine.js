// ─── MOTOR GRADE HUB (verificado) ───────────────────────────────────────────
// Núcleo de cálculo unificado. Soporta árbol arbitrario + reglas:
// weighted_average · gated_average (ambos hijos ≥ mín) · min_grade_required (piso por hoja).
// FENnotas lo alimenta vía ramoToStructure() (adaptador del modelo categorias→notas).
function gh_excelRound(value,decimals){const f=Math.pow(10,decimals);return Math.sign(value)*Math.round(Math.abs(value)*f)/f;}
function gh_roundFinal(value,meta){if(value===null)return null;const d=meta?.rounding?.decimals??1;return gh_excelRound(value,d);}
function gh_weightOf(node,ov){const o=ov?.[node.id];if(o&&typeof o.weight==='number')return o.weight;return node.weight;}
function gh_meta(s){return s.__meta||{};}
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
  if(remainingWeight===0){const reached=direct.raw;return {feasible:reached>=target&&gateWarnings.length===0,requiredAverage:null,emptyLeaves:direct.emptyLeaves,message:gateWarnings.length?`Curso completo, con tope por compuerta. Nota final: ${direct.value}.`:(reached>=target?`Ya alcanzaste ${target}.`:`No quedan evaluaciones; tu nota final es ${direct.value}.`),conditions,gateWarnings,scaleMin,scaleMax};}
  const required=(target-known)/remainingWeight;const reqRounded=gh_excelRound(required,2);
  const feasible=reqRounded>=scaleMin&&reqRounded<=scaleMax&&gateWarnings.length===0;
  return {feasible,requiredAverage:reqRounded,emptyLeaves:direct.emptyLeaves,message:'',conditions,gateWarnings,scaleMin,scaleMax};
}
