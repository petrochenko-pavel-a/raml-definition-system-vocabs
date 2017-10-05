import ds=require("./definitionSystem")
var yaml=require("js-yaml")
import fs=require("fs")
import path=require("path")
export interface Dialect{
    dialect: string
    version: string
    usage?: string
    vocabularies: { [name:string]:string }
    external: { [name:string]:string }
    nodeMappings: { [name:string]:NodeMapping}
    raml:{
        document: {
            encodes: string
        }
        fragments?: { [name:string]: string}
        module?: {
            declares?: { [name: string]: string }
        }
    }
}
export interface NodeMapping{
    classTerm?:string
    mapping: { [name:string]: PropertyMapping}
}
export interface PropertyMapping{
    propertyTerm: string
    mandatory?: boolean
    enum?: string[]
    range: string | string[]
    pattern?: string
    asMap?: boolean
    hash?: string
    allowMultiple?: boolean
}

export function loadDialect(p:string){
    var obj=yaml.safeLoad(fs.readFileSync(p).toString())
    new DialectCreator(ds.getUniverse("RAML10")).process(obj);
}

class DialectCreator{
    u:ds.Universe;
    constructor( u:ds.Universe){
        this.u=new ds.Universe({},"",u)
        this.u.setUniverseVersion("RAML10");
    }

    private types: { [name:string]:ds.ITypeDefinition} ={}

    process(d:Dialect){
        Object.keys(d.nodeMappings).forEach(v=>{
            var cl=new ds.NodeClass(v,this.u,"");
            this.u.register(cl);
            this.types[v]=cl;
        })
        Object.keys(d.nodeMappings).forEach(v=>{
            const props=d.nodeMappings[v].mapping
            Object.keys(props).forEach(p=>{
                let pr=props[p];

                let rng = pr.range;
                if (Array.isArray(rng)){
                    var range = this.parseUnion(rng, p);
                }
                else {
                    const __ret = this.parseRange(<string>rng, p);
                    rng = __ret.rng;
                    var range = __ret.range;
                }
                let actualProp=ds.prop(p,"",<any>this.types[v],range,false);
                if (pr.allowMultiple){
                    actualProp.withMultiValue(true);
                }
                if (pr.asMap){
                    actualProp.withMultiValue(true);
                }
                if (pr.enum){
                    actualProp.withEnumOptions(pr.enum);
                }
                actualProp.unmerge();
            })
        })
        let name="#%"+d.dialect+" "+d.version;
        this.u.setTopLevel(d.raml.document.encodes);
        this.u.registerSuperClass(this.types[d.raml.document.encodes],this.u.type("FragmentDeclaration"))
        this.u.setTypedVersion("1.0")
        this.u.setUniverseVersion("RAML10")

        ds.registerUniverse(name,this.u);
    }

    private parseUnion(rng: string | string[], p) {
        var range: ds.ITypeDefinition = null;
        (<string[]>rng).forEach(r => {
            if (!range) {
                range = this.parseRange(r, p).range;
            }
            else {
                let u = new ds.Union("", this.u);
                u.right = range;
                u.left = this.parseRange(r, p).range;
                range = u;
            }
        })
        return range;
    }

    private parseRange(rng: string, p) {
        var range = this.types[rng];
        if (!range) {
            if (rng == "string" || rng == "uri") {
                rng = "StringType"
            }
            if (rng == "boolean") {
                rng = "BooleanType"
            }
            if (rng == "number") {
                rng = "NumberType"
            }
            range = this.u.type(rng);
        }
        if (!range) {
            console.log("Error can not bind property :" + p + " to range:" + rng)
        }
        return {rng, range};
    }
}

export function init(){
    fs.readdirSync(path.resolve(__dirname,"../dialects/")).forEach(f=>{
        loadDialect(path.resolve(__dirname,"../dialects/"+f))
    })

}

