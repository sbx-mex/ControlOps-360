import {normalize} from './engine.mjs';

// Recipes supplied with the Ensamble operating table. Quantities are per
// finished product; grams are kept as a second, auditable unit of reference.
const RECIPES=[
 {name:'Bagel Jamon &Queso',rule:'3 rebanadas de jamón de 18 g c/u y 1 rebanada de queso de 30 g',components:[['Jamón',3,'rebanadas',18],['Queso',1,'rebanada',30]]},
 {name:'Baguette Clásica',rule:'4 rebanadas de jamón de 18 g c/u y 3 medias rebanadas de queso de 15 g c/u',components:[['Jamón',4,'rebanadas',18],['Queso',3,'medias rebanadas',15]]},
 {name:'Baguette suprema',rule:'3 rebanadas de jamón de 18 g c/u, 3 de chorizo de 6 g c/u, 3 medias de queso de 15 g c/u y 3 de lomo de 8 g c/u',components:[['Jamón',3,'rebanadas',18],['Chorizo',3,'rebanadas',6],['Queso',3,'medias rebanadas',15],['Lomo',3,'rebanadas',8]]},
 {name:'BaguetteEspañola',rule:'6 rebanadas de chorizo de 6 g c/u y 3 medias rebanadas de queso de 15 g c/u',components:[['Chorizo',6,'rebanadas',6],['Queso',3,'medias rebanadas',15]]},
 {name:'Croissant Jamon &Queso',rule:'3 rebanadas de jamón de 18 g c/u y 1 rebanada de queso de 30 g',components:[['Jamón',3,'rebanadas',18],['Queso',1,'rebanada',30]]},
 {name:'Panini Pavo',rule:'Viene empaquetada; no requiere porcionado de ingredientes en tienda',packaged:true,components:[]},
];

export const ASSEMBLY_RECIPES=new Map(RECIPES.map(recipe=>[normalize(recipe.name),{
 ...recipe,
 key:normalize(recipe.name),
 components:recipe.components.map(([name,units,unit,gramsEach])=>({name,units,unit,gramsEach})),
}]));

export function assemblyRecipe(name){return ASSEMBLY_RECIPES.get(normalize(name))||null;}

export function projectedIngredients(recipe,plannedUnits){
 const plan=Math.max(0,Number(plannedUnits)||0);
 return (recipe?.components||[]).map(component=>({...component,totalUnits:component.units*plan,totalGrams:component.gramsEach*component.units*plan}));
}
