import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Also load .env.local when present (used by some local setups / AI Studio)
try {
  const localEnvPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
    console.log('Loaded .env.local');
  }
} catch (e) {
  // ignore
}

const PORT = 3000;

async function runNpmAudit(owner: string, repo: string): Promise<string> {
  try {
     const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`);
     if (!res.ok) return "Aucun package.json trouvé ou erreur API.";
     const data = await res.json();
     if (data.content) {
        const packageJsonStr = Buffer.from(data.content, 'base64').toString('utf-8');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-audit-'));
        fs.writeFileSync(path.join(tmpDir, 'package.json'), packageJsonStr);
        try {
           execSync('npm install --package-lock-only --ignore-scripts', { cwd: tmpDir, stdio: 'ignore' });
           const auditOutput = execSync('npm audit --json', { cwd: tmpDir }).toString();
           return auditOutput;
        } catch (auditErr: any) {
           if (auditErr.stdout) {
              return auditErr.stdout.toString();
           }
           return "Erreur d'audit : " + auditErr.message;
        } finally {
           fs.rmSync(tmpDir, { recursive: true, force: true });
        }
     }
  } catch(e: any) {
     return "Impossible d'exécuter npm audit: " + e.message;
  }
  return "Non applicable.";
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Route for GitHub Audit
  app.post("/api/audit", async (req, res) => {
    try {
      console.log('Received /api/audit request body:', JSON.stringify(req.body).slice(0, 2000));
      const { repoUrl, repoUrl2, model } = req.body;
      
      if (!repoUrl || !model) {
        return res.status(400).json({ error: "Missing repoUrl or model", received: { repoUrl: repoUrl || null, model: model || null } });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (!geminiApiKey) {
        return res.status(500).json({ error: "Veuillez configurer GEMINI_API_KEY dans les variables d'environnement." });
      }

      const parseUrl = (url: string) => {
        try {
          const urlObj = new URL(url);
          const parts = urlObj.pathname.split("/").filter(Boolean);
          if (urlObj.hostname !== "github.com" || parts.length < 2) return null;
          return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
        } catch(e) { return null; }
      }

      const p1 = parseUrl(repoUrl);
      if (!p1) return res.status(400).json({ error: "Invalid GitHub URL" });
      const { owner, repo } = p1;

      let owner2 = "", repo2 = "";
      if (repoUrl2) {
        const p2 = parseUrl(repoUrl2);
        if (!p2) return res.status(400).json({ error: "Invalid secondary GitHub URL" });
        owner2 = p2.owner;
        repo2 = p2.repo;
      }

      const headers = { 
        "User-Agent": "AuditSaaS-App",
        "Accept": "application/vnd.github.v3+json"
      };

      const fetchMetadata = async (o: string, r: string) => {
        let repoData: any = { full_name: `${o}/${r}`, description: "Non spécifié", stargazers_count: "?", forks_count: "?", language: "Inconnu", open_issues_count: "?" };
        try {
          const repoRes = await fetch(`https://api.github.com/repos/${o}/${r}`, { headers });
          if (repoRes.ok) repoData = await repoRes.json();
        } catch (e) {}

        let readmeContent = "Aucun README trouvé.";
        try {
          const readmeRes = await fetch(`https://api.github.com/repos/${o}/${r}/readme`, { headers });
          if (readmeRes.ok) {
            const readmeJson = await readmeRes.json();
            readmeContent = Buffer.from(readmeJson.content, 'base64').toString('utf-8');
          }
        } catch (e) {}
        
        return { repoData, readmeContent };
      };

      const [data1, data2] = await Promise.all([
        fetchMetadata(owner, repo),
        repoUrl2 ? fetchMetadata(owner2, repo2) : Promise.resolve(null)
      ]);

      const fetchCodebase = (o: string, r: string) => {
        let codebaseMd = "Codebase non récupérée.";
        try {
          const outputFilename = `repomix-${Date.now()}-${Math.floor(Math.random() * 1000)}.md`;
          const ignorePatterns = "node_modules,dist,build,public,assets,docs,test,tests,coverage,vendor,*.min.js,*.lock,package-lock.json,yarn.lock,pnpm-lock.yaml";
          execSync(`npx repomix --remote ${o}/${r} --style markdown --output ${outputFilename} --ignore "${ignorePatterns}"`, { stdio: 'pipe' });
          
          if (fs.existsSync(outputFilename)) {
            const fullContent = fs.readFileSync(outputFilename, 'utf-8');
            const MAX_CHARS = 80000;
            if (fullContent.length > MAX_CHARS) {
                codebaseMd = fullContent.substring(0, MAX_CHARS / 2) + "\n\n... [CODE TRUNCATED DUE TO TOKEN LIMITS] ...\n\n" + fullContent.substring(fullContent.length - MAX_CHARS / 2);
            } else {
                codebaseMd = fullContent;
            }
            fs.unlinkSync(outputFilename);
          }
        } catch (e: any) {
          codebaseMd = "Failed to fetch full codebase. " + e.message;
        }
        return codebaseMd;
      };

      console.log(`Running analysis...`);
      // Run sequentially to balance latency vs rate limiting
      const codebase1 = fetchCodebase(owner, repo);
      const auditLog1 = await runNpmAudit(owner, repo);
      
      let codebase2 = "", auditLog2 = "";
      if (repoUrl2) {
        codebase2 = fetchCodebase(owner2, repo2);
        auditLog2 = await runNpmAudit(owner2, repo2);
      }

      // 3. Prepare Prompt
      let systemPrompt = `Tu es un Senior Software Engineer spécialisé en SaaS, architecture, et sécurité. Ton objectif est d'auditer un dépôt GitHub basé sur ses métadonnées, son README, les résultats d'npm audit (Sécurité) et l'extrait du code.
Sois particulièrement intransigeant sur la détection de packages obsolètes, dépréciés, ou non maintenus. Pénalise sévèrement l'utilisation de bibliothèques abandonnées et justifie tes notes dans le rapport.

Tu DOIS répondre UNIQUEMENT avec un objet JSON pur respectant cette structure, obligatoirement en FRANÇAIS :
{
  "score": number (0-100),
  "summary": "string (Verdict global concis)",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "security": { "score": number, "notes": "string (notes détaillées incluant les vulnérabilités npm audit)" },
  "architecture": { "score": number, "notes": "string (notes détaillées incluant la vétusté du code/dépendances)" },
  "recommendations": ["string", "string"]
}
Ne pas inclure de balises markdown (comme \`\`\`json) ou de texte supplémentaire.`;

      let userPrompt = `=== DÉPÔT À AUDITER ===
Nom: ${data1.repoData.full_name}
Description: ${data1.repoData.description || 'Aucune'}
Étoiles: ${data1.repoData.stargazers_count}
Forks: ${data1.repoData.forks_count}
Langage: ${data1.repoData.language}
Issues ouvertes: ${data1.repoData.open_issues_count}

Résultat NPM Audit (Log de sécurité) :
${auditLog1.substring(0, 3000)}

Extrait du README :
${data1.readmeContent.substring(0, 2000)}

Extrait du Code :
${codebase1}
`;

      if (repoUrl2 && data2) {
        systemPrompt = `Tu es un Analyste Tech Senior. Ton rôle est de comparer DEUX dépôts GitHub et d'émettre un rapport COMPARATIF sous un seul format JSON en déterminant lequel est la meilleure option de manière objective.
Sois particulièrement intransigeant sur la détection de packages obsolètes.
Tu DOIS répondre UNIQUEMENT par JSON pur en FRANÇAIS :
{
  "score": number (Score comparatif global, ou moyenne des deux),
  "summary": "string (Comparaison détaillée: repo A vs repo B, qui est meilleur ?)",
  "strengths": ["string (A: force)", "string (B: force)"],
  "weaknesses": ["string (A: faiblesse)", "string (B: faiblesse)"],
  "security": { "score": number, "notes": "string (Résumé comparatif des vuln npm audit et de la sécurité des deux projets)" },
  "architecture": { "score": number, "notes": "string (Comparaison architecturale: ex. React Router vs TanStack)" },
  "recommendations": ["string (Choix final recommandé et pourquoi)"]
}`;
        userPrompt += `
=== 2ÈME DÉPÔT À COMPARER ===
Nom: ${data2.repoData.full_name}
Description: ${data2.repoData.description || 'Aucune'}

Résultat NPM Audit (Log) 2:
${auditLog2.substring(0, 3000)}

Extrait README 2:
${data2.readmeContent.substring(0, 2000)}

Extrait Code 2:
${codebase2}
`;
      }

      let rawContent = "";
      
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        let finalModel = model.startsWith("gemini") ? model : "gemini-2.5-flash";
        if (repoUrl2) finalModel = "gemini-2.5-pro"; // Better logic handling for comparisons
        
        const response = await ai.models.generateContent({
           model: finalModel,
           contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }]
        });
        rawContent = response.text || "";
      } catch (e: any) {
        return res.status(500).json({ error: "Erreur de communication API IA.", details: e.message });
      }
      
      const cleanJsonStr = rawContent.replace(/^```json/m, '').replace(/^```/m, '').replace(/```$/m, '').trim();

      let auditResult;
      try {
        auditResult = JSON.parse(cleanJsonStr);
        auditResult.id = `${owner}-${repo}-${Date.now()}`;
        auditResult.repoUrl = repoUrl2 ? `${repoUrl} VS ${repoUrl2}` : repoUrl;
        auditResult.date = new Date().toISOString();
      } catch (parseError) {
        return res.status(500).json({ error: "The AI model returned an invalid response format.", raw: rawContent });
      }

      return res.json(auditResult);

    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve static files and SPA fallback
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
