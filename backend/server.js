
const express=require("express");const sqlite3=require("sqlite3").verbose();const bcrypt=require("bcrypt");
const jwt=require("jsonwebtoken");const cors=require("cors");const path=require("path");const Papa=require("papaparse");
const multer=require("multer");const upload=multer({storage:multer.memoryStorage()});
const app=express();const PORT=process.env.PORT||3000;const SECRET=process.env.SECRET||"change_me";
const DB_PATH=process.env.DB_PATH||path.join(__dirname,"db.sqlite");
app.use(cors());app.use(express.json());app.use(express.static(path.join(__dirname,"../frontend")));
const db=new sqlite3.Database(DB_PATH);

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS shuls(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,address TEXT DEFAULT '',area TEXT DEFAULT '',lat REAL,lon REAL)`);
  db.run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('superadmin','admin','gabai')))`);
  db.run(`CREATE TABLE IF NOT EXISTS user_shuls(userId INTEGER NOT NULL, shulId INTEGER NOT NULL, PRIMARY KEY(userId, shulId))`);
  db.run(`CREATE TABLE IF NOT EXISTS minyanim(id INTEGER PRIMARY KEY AUTOINCREMENT,shulId INTEGER NOT NULL,type TEXT NOT NULL,time TEXT NOT NULL,note TEXT DEFAULT '')`);
});

const initialShuls=[
"Adass Yeshurun Shul","Aish HaTorah","Chabad of Illovo","Chabad of Norwood","Chabad of Savoy","Chabad of Strathavon","Chabad Yeshiva – Main Campus (one of the 2 Chabad yeshivas)","Chabad Yeshiva – Secondary Campus (the second Chabad yeshiva)","Chofetz Chaim","Duek Neitz Minyan (Glenhazel)","Hama’or Centre","Keter Torah Synagogue","Kollel Yad Shaul","Linksfield-Senderwood Hebrew Congregation","Maharsha","Melrose Arch Minyan","Mizrachi Yeshiva College Shul","Norwood Shteibel","Ohr Somayach Glenhazel","Ohr Somayach Savoy","Ohr Somayach of Gallo Manor","Pine Street Shul (Glenhazel)","Pretoria Hebrew Congregation (Pretoria Shul)","Rabbi Hendler’s Shul (Sydenham area)","Rabbi Moffson’s Shul (Glenhazel)","Rav Tanzer’s Shul – Yeshiva College Campus","Sandton Shul (Beth Hamedrash Hagadol Sandton)","Shaarei Chayim Synagogue (Glenhazel)","Shomer Emunim Synagogue (Glenhazel)","Sunny Road Kehilla (Glenhazel)","Sydenham Highlands North Hebrew Congregation (Sydenham Shul)","Torah Academy Shul (Glenhazel)","Yeshiva Gedolah of Johannesburg","Young Chabad Minyan (Glenhazel)","The Beis Shul (Glenhazel)"
];
const ADMIN_EMAIL=process.env.ADMIN_EMAIL;const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD;
db.get("SELECT COUNT(*) c FROM shuls",(e,r)=>{if(!e&&r&&r.c===0){const st=db.prepare("INSERT INTO shuls(name,address,area) VALUES(?,?,?)");initialShuls.forEach(n=>st.run(n,"",""));st.finalize(()=>console.log("Seeded shuls"));}});
db.get("SELECT COUNT(*) c FROM users",(e,r)=>{if(!e&&r&&r.c===0&&ADMIN_EMAIL&&ADMIN_PASSWORD){bcrypt.hash(ADMIN_PASSWORD,10).then(h=>{db.run("INSERT INTO users(email,password,role) VALUES(?,?,?)",[ADMIN_EMAIL,h,"superadmin"],()=>console.log("Seeded superadmin"));});}});

function auth(req,res,next){const t=req.headers.authorization?.split(" ")[1];if(!t)return res.status(401).json({error:"No token"});jwt.verify(t,SECRET,(e,u)=>{if(e)return res.status(403).json({error:"Invalid token"});req.user=u;next();});}
function allow(...roles){return (req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();}}
async function geocode(address){if(!address)return {lat:null,lon:null};try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);const j=await r.json();if(Array.isArray(j)&&j[0])return {lat:parseFloat(j[0].lat),lon:parseFloat(j[0].lon)};}catch(e){}return {lat:null,lon:null};}

app.post("/login",(req,res)=>{const{email,password}=req.body;db.get("SELECT * FROM users WHERE email=?",[email],async(e,u)=>{if(e)return res.status(500).json({error:"DB error"});if(!u)return res.status(400).json({error:"User not found"});const ok=await bcrypt.compare(password,u.password);if(!ok)return res.status(400).json({error:"Wrong password"});const token=jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"2d"});res.json({token,role:u.role});});});

// Users (superadmin only)
app.get("/users",auth,allow("superadmin"),(req,res)=>{
  const sql=`SELECT u.id,u.email,u.role,group_concat(us.shulId) shulIds FROM users u LEFT JOIN user_shuls us ON us.userId=u.id GROUP BY u.id ORDER BY u.role DESC,u.email`;
  db.all(sql,[],(e,rows)=>res.status(e?500:200).json(e?{error:"DB error"}:rows));
});
app.post("/users",auth,allow("superadmin"),async(req,res)=>{
  const{email,password,role}=req.body; if(!email||!password||!role) return res.status(400).json({error:"Missing fields"});
  const h=await bcrypt.hash(password,10);
  db.run("INSERT INTO users(email,password,role) VALUES(?,?,?)",[email,h,role],function(err){res.status(err?400:200).json(err?{error:err.message}:{id:this.lastID});});
});
app.put("/users/:id",auth,allow("superadmin"),async(req,res)=>{
  const id=parseInt(req.params.id,10); const{role,password}=req.body;
  db.get("SELECT role FROM users WHERE id=?", [id], async (e,row)=>{
    if(e||!row) return res.status(404).json({error:"User not found"});
    if(role && row.role==="superadmin" && role!=="superadmin"){
      db.get("SELECT COUNT(*) c FROM users WHERE role='superadmin'", (e2, r2)=>{
        if(e2) return res.status(500).json({error:"DB error"});
        if(r2.c<=1) return res.status(400).json({error:"Cannot demote the last superadmin"});
        updateUser();
      });
    } else { updateUser(); }
    async function updateUser(){
      const sets=[],p=[];
      if(role){sets.push("role=?");p.push(role);} if(password){const h=await bcrypt.hash(password,10);sets.push("password=?");p.push(h);}
      if(!sets.length) return res.json({updated:0}); p.push(id);
      db.run(`UPDATE users SET ${sets.join(", ")} WHERE id=?`,p,function(err){res.status(err?400:200).json(err?{error:err.message}:{updated:this.changes});});
    }
  });
});
app.put("/users/:id/shuls",auth,allow("superadmin"),(req,res)=>{
  const id=parseInt(req.params.id,10); const shulIds=Array.isArray(req.body)?req.body:[];
  db.serialize(()=>{
    db.run("DELETE FROM user_shuls WHERE userId=?",[id],e=>{
      if(e) return res.status(400).json({error:e.message});
      if(!shulIds.length) return res.json({assigned:0});
      const st=db.prepare("INSERT INTO user_shuls(userId,shulId) VALUES(?,?)"); shulIds.forEach(sid=>st.run(id,sid));
      st.finalize(err=>res.status(err?400:200).json(err?{error:err.message}:{assigned:shulIds.length}));
    });
  });
});

// Shuls + minyanim
app.get("/shuls",(req,res)=>{
  db.all("SELECT * FROM shuls ORDER BY name COLLATE NOCASE",[],(e,shuls)=>{
    if(e) return res.status(500).json({error:"DB error"});
    const ids=shuls.map(s=>s.id); if(!ids.length) return res.json([]);
    db.all(`SELECT * FROM minyanim WHERE shulId IN (${ids.map(()=>"?").join(",")}) ORDER BY type,time`,ids,(e2,mins)=>{
      if(e2) return res.status(500).json({error:"DB error"});
      const g={}; mins.forEach(m=>{ (g[m.shulId]=g[m.shulId]||[]).push(m); });
      res.json(shuls.map(s=>({...s,minyanim:g[s.id]||[]})));
    });
  });
});
app.get("/shuls/:id/full",(req,res)=>{
  const id=parseInt(req.params.id,10);
  db.get("SELECT * FROM shuls WHERE id=?",[id],(e,s)=>{
    if(e||!s) return res.status(404).json({error:"Not found"});
    db.all("SELECT * FROM minyanim WHERE shulId=? ORDER BY type,time",[id],(e2,mins)=>res.json({...s,minyanim:mins||[]}));
  });
});

function canEdit(user,shulId,cb){ if(user.role==="superadmin"||user.role==="admin") return cb(true);
  db.get("SELECT 1 FROM user_shuls WHERE userId=? AND shulId=?",[user.id,shulId],(e,row)=> cb(!e&&!!row)); }

app.post("/shuls",auth,allow("superadmin","admin"),async(req,res)=>{
  const {name,address,area}=req.body; if(!name) return res.status(400).json({error:"Missing name"});
  const {lat,lon}=await geocode(address||"");
  db.run("INSERT INTO shuls(name,address,area,lat,lon) VALUES(?,?,?,?,?)",[name,address||"",area||"",lat,lon],
    function(err){res.status(err?400:200).json(err?{error:err.message}:{id:this.lastID,lat,lon});});
});
app.put("/shuls/:id",auth,(req,res)=>{
  const id=parseInt(req.params.id,10); const {name,address,area}=req.body;
  canEdit(req.user,id, async ok=>{
    if(!ok) return res.status(403).json({error:"No permission"});
    const sets=[],p=[];
    if(typeof name!=="undefined"){sets.push("name=?");p.push(name);}
    if(typeof address!=="undefined"){const geo=await geocode(address||"");sets.push("address=?","lat=?","lon=?");p.push(address||"",geo.lat,geo.lon);}
    if(typeof area!=="undefined"){sets.push("area=?");p.push(area||"");}
    if(!sets.length) return res.json({updated:0}); p.push(id);
    db.run(`UPDATE shuls SET ${sets.join(", ")} WHERE id=?`,p,function(err){res.status(err?400:200).json(err?{error:err.message}:{updated:this.changes});});
  });
});
app.put("/shuls/:id/minyanim",auth,(req,res)=>{
  const id=parseInt(req.params.id,10); const items=Array.isArray(req.body)?req.body:[];
  canEdit(req.user,id, ok=>{
    if(!ok) return res.status(403).json({error:"No permission"});
    db.serialize(()=>{
      db.run("DELETE FROM minyanim WHERE shulId=?",[id],e=>{
        if(e) return res.status(400).json({error:e.message});
        if(!items.length) return res.json({replaced:0});
        const st=db.prepare("INSERT INTO minyanim(shulId,type,time,note) VALUES(?,?,?,?)");
        items.forEach(it=> st.run(id,it.type,it.time,it.note||""));
        st.finalize(err=> res.status(err?400:200).json(err?{error:err.message}:{replaced:items.length}));
      });
    });
  });
});

app.get("/my-shuls",auth,(req,res)=>{
  if(req.user.role==="superadmin"||req.user.role==="admin"){ return db.all("SELECT * FROM shuls ORDER BY name",[],(e,rows)=> res.json(rows||[])); }
  db.all("SELECT s.* FROM shuls s INNER JOIN user_shuls us ON us.shulId=s.id WHERE us.userId=? ORDER BY s.name",[req.user.id],(e,rows)=> res.json(rows||[]));
});

/** EXPORT CSV endpoints (superadmin) */
const csvOpts={header:true,quotes:true,skipEmptyLines:true};
app.get("/export/users.csv",auth,allow("superadmin"),(req,res)=>{
  db.all("SELECT id,email,role,password as password_hash FROM users",[],(e,rows)=>{
    if(e) return res.status(500).send("DB error");
    const csv=Papa.unparse(rows,csvOpts);
    res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",'attachment; filename="users.csv"');res.send(csv);
  });
});
app.get("/export/shuls.csv",auth,allow("superadmin"),(req,res)=>{
  db.all("SELECT id,name,address,area,lat,lon FROM shuls",[],(e,rows)=>{
    if(e) return res.status(500).send("DB error");
    const csv=Papa.unparse(rows,csvOpts);
    res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",'attachment; filename="shuls.csv"');res.send(csv);
  });
});
app.get("/export/minyanim.csv",auth,allow("superadmin"),(req,res)=>{
  db.all("SELECT id,shulId,type,time,note FROM minyanim",[],(e,rows)=>{
    if(e) return res.status(500).send("DB error");
    const csv=Papa.unparse(rows,csvOpts);
    res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",'attachment; filename="minyanim.csv"');res.send(csv);
  });
});

/** IMPORT CSV (superadmin). Accepts multipart with optional files: users, shuls, minyanim.
 *  If ?replace=1, it will clear tables first. Password handling:
 *  - If "password" column present and non-empty, it will be hashed and used.
 *  - Else if "password_hash" column present, it's used as-is.
 */
app.post("/import",auth,allow("superadmin"),upload.fields([{name:"users"},{name:"shuls"},{name:"minyanim"}]),async(req,res)=>{
  const replace=String(req.query.replace||"0")==="1";
  function parseCSV(buf){return Papa.parse(buf.toString("utf8"),{header:true,skipEmptyLines:true}).data;}
  try{
    if(replace){
      await new Promise(ok=>db.serialize(()=>{db.run("DELETE FROM user_shuls");db.run("DELETE FROM minyanim");db.run("DELETE FROM users");db.run("DELETE FROM shuls",ok);}));
    }
    if(req.files?.shuls?.[0]){
      const rows=parseCSV(req.files.shuls[0].buffer);
      for(const r of rows){
        await new Promise(ok=>{
          const p=[r.name||"",r.address||"",r.area||"",r.lat?Number(r.lat):null,r.lon?Number(r.lon):null];
          db.run("INSERT INTO shuls(name,address,area,lat,lon) VALUES(?,?,?,?,?)",p,()=>ok());
        });
      }
    }
    if(req.files?.users?.[0]){
      const rows=parseCSV(req.files.users[0].buffer);
      for(const r of rows){
        const email=String(r.email||""); if(!email) continue;
        let passHash=String(r.password_hash||"");
        if(r.password && String(r.password).trim().length){ passHash=await bcrypt.hash(String(r.password).trim(),10); }
        if(!passHash) passHash=await bcrypt.hash("changeme123",10);
        const role=(r.role==="admin"||r.role==="gabai")?r.role:"superadmin";
        await new Promise(ok=>db.run("INSERT INTO users(email,password,role) VALUES(?,?,?)",[email,passHash,role],()=>ok()));
      }
    }
    if(req.files?.minyanim?.[0]){
      const rows=parseCSV(req.files.minyanim[0].buffer);
      for(const r of rows){
        const p=[Number(r.shulId),String(r.type||""),String(r.time||""),String(r.note||"")];
        if(!p[0] || !p[1] || !p[2]) continue;
        await new Promise(ok=>db.run("INSERT INTO minyanim(shulId,type,time,note) VALUES(?,?,?,?)",p,()=>ok()));
      }
    }
    res.json({ok:true});
  }catch(err){ console.error(err); res.status(400).json({error:"Import failed"}); }
});

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"../frontend/index.html")));
app.listen(PORT,()=>console.log("Minyanim SA running on "+PORT));
