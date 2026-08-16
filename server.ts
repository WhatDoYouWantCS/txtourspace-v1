import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Dynamic Offline Response Proxy Endpoint - 100% Client-Resilient with absolutely ZERO API calls or AI token costs
app.post("/api/gemini-chat", async (req, res) => {
  const { partnerName, partnerBio, messages } = req.body;

  // character-specific smart reply logic
  const getSmartFallbackReply = (name: string, bio: string, msgs: any[]): string => {
    const lastMsg = msgs && msgs.length > 0 ? msgs[msgs.length - 1].text : "";
    const textLower = lastMsg.toLowerCase();
    const nameLower = name.toLowerCase();

    if (nameLower.includes("sara") || nameLower.includes("sarah")) {
      if (textLower.includes("hello") || textLower.includes("hi") || textLower.includes("hey")) {
        return "Hey there! 🎶 Just working on a fresh synth beat. What are you up to?";
      }
      if (textLower.includes("music") || textLower.includes("song") || textLower.includes("synth") || textLower.includes("sound")) {
        return "I love that! Music is such a universal language. Let's make something together soon!";
      }
      return "That's super interesting! I'm lost in my headphone zone right now, let's catch up shortly.";
    }

    if (nameLower.includes("alex")) {
      if (textLower.includes("hello") || textLower.includes("hi") || textLower.includes("hey")) {
        return "Hey! Just packed my hiking gear. Ready for an adventure today?";
      }
      if (textLower.includes("hike") || textLower.includes("run") || textLower.includes("sport") || textLower.includes("trail")) {
        return "Absolutely! There's nothing like being out in nature to clear your mind.";
      }
      return "Nice! I'm in the middle of a trail run right now, talk to you as soon as I get back!";
    }

    if (nameLower.includes("elena")) {
      if (textLower.includes("hello") || textLower.includes("hi") || textLower.includes("hey")) {
        return "Hello! Checking out some new UI mockups. How is your day going?";
      }
      if (textLower.includes("design") || textLower.includes("art") || textLower.includes("color") || textLower.includes("ui") || textLower.includes("app")) {
        return "I agree. Aesthetic balance and pixel perfection are so critical!";
      }
      return "Fascinating! Let me sketch out a couple of wireframe ideas and I'll send them over.";
    }

    if (nameLower.includes("david")) {
      if (textLower.includes("hello") || textLower.includes("hi") || textLower.includes("hey")) {
        return "Hey! Just finishing a project call. What's on your mind?";
      }
      if (textLower.includes("business") || textLower.includes("work") || textLower.includes("money") || textLower.includes("project")) {
        return "Exactly. Staying focused on high leverage actions is key to scaling successfully.";
      }
      return "Good point. Let review our sprint timeline and we can make some adjustments!";
    }

    // Heuristics based on bio keywords
    if (bio.toLowerCase().includes("music") || bio.toLowerCase().includes("melody")) {
      return "Melodies keep me going! Talk to you right after I finish editing this audio track.";
    }
    if (bio.toLowerCase().includes("hike") || bio.toLowerCase().includes("mountain")) {
      return "Nature always has the best answers. Let's touch base once I am back on grid!";
    }
    if (bio.toLowerCase().includes("design") || bio.toLowerCase().includes("pixel")) {
      return "Spreading creativity, one pixel at a time. Let me look at the layout and get back!";
    }

    return "Hey! I completely hear you on that. Let's definitely talk more about it in a bit!";
  };

  const reply = getSmartFallbackReply(partnerName, partnerBio, messages);
  return res.json({ reply });
});

// Initialize Vite server or static file handler
async function setupRouter() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

setupRouter();
