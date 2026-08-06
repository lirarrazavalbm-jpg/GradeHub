// ─── MOTOR GRADE HUB (verificado) ───────────────────────────────────────────
// Núcleo de cálculo unificado. Soporta árbol arbitrario + reglas:
// weighted_average · gated_average (ambos hijos ≥ mín) · min_grade_required (piso por hoja).
// FENnotas lo alimenta vía ramoToStructure() (adaptador del modelo categorias→notas).
function gh_excelRound(value,decimals){const f=Math.pow(10,decimals);return Math.sign(value)*Math.round(Math.abs(value)*f)/f;}
function gh_roundFinal(value,meta){if(value===null)return null;const d=meta?.rounding?.decimals??1;return gh_excelRound(value,d);}
function gh_weightOf(node,ov){const o=ov?.[node.id];if(o&&typeof o.weight==='number')return o.weight;return node.weight;}
function gh_meta(s){return s.__meta||{};}
function calculateFinalGrade(structure,grades,overrides={}){
  const breakdown=[],emptyLeaves=[],gates=[];
  function evalNode(node){
    if(node.type==='leaf'){const g=grades[node.id];const value=(typeof g==='number')?g:null;breakdown.push({id:node.id,name:node.name,value,complete:value!==null});return {value,complete:value!==null};}
    let sumW=0,acc=0,known=[],allComplete=true;
    for(const c of node.children){const cr=evalNode(c);if(!cr.complete)allComplete=false;if(cr.value!==null){const w=gh_weightOf(c,overrides);acc+=cr.value*w;sumW+=w;known.push({child:c,value:cr.value,complete:cr.complete});}}
    let value=sumW>0?acc/sumW:null;
    if(node.aggregation_rule==='gated_average'&&value!==null){const p=node.rule_params||{};const off=known.filter(k=>k.value<p.min_required);const locked=off.filter(o=>o.complete);const ok=off.length===0;gates.push({nodeId:node.id,kind:'gated_average',ok,min_required:p.min_required,fail_cap:p.fail_cap,offenders:off.map(o=>o.child.name),lockedOffenders:locked.map(o=>o.child.name),pending:known.length<node.children.length});if(!ok)value=Math.min(value,p.fail_cap);}
    breakdown.push({id:node.id,name:node.name,value,complete:allComplete});return {value,complete:allComplete};
  }
  let rootValue=evalNode(structure).value;
  const effW=gh_effWeights(structure,overrides);
  gh_collectEmpty(structure,grades,effW,emptyLeaves);
  gh_leafGates(structure,grades,(gate)=>{gates.push(gate);if(!gate.ok&&rootValue!==null)rootValue=Math.min(rootValue,gate.fail_cap);});
  return {value:gh_roundFinal(rootValue,gh_meta(structure)),raw:rootValue,complete:emptyLeaves.length===0,breakdown,emptyLeaves,gates};
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
