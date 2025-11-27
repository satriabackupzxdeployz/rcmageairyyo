/*CREATOR : RIICODE*/
// FREE SOURCE CODE //
// DON'T SELL //
// JANGAN HAPUS WM YAPIT
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

const MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp"
};

const DL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.google.com/",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  Priority: "u=1, i"
};

class GridPlus {
  constructor() {
    this.ins = axios.create({
      baseURL: "https://api.grid.plus/v1",
      headers: {
        "user-agent": "Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
        "X-AppID": "808645",
        "X-Platform": "h5",
        "X-Version": "8.9.7",
        "X-SessionToken": "",
        "X-UniqueID": this.uid(),
        "X-GhostID": this.uid(),
        "X-DeviceID": this.uid(),
        "X-MCC": "id-ID",
        sig: `XX${this.uid() + this.uid()}`
      }
    });
  }

  uid() {
    return crypto.randomUUID().replace(/-/g, "");
  }

  form(dt) {
    const f = new FormData();
    Object.entries(dt ?? {}).forEach(([k, v]) => {
      if (v != null) f.append(k, String(v));
    });
    return f;
  }

  ext(buf) {
    const h = buf.subarray(0, 12).toString("hex");
    return h.startsWith("ffd8ffe") ? "jpg" : h.startsWith("89504e47") ? "png" : h.startsWith("52494646") && h.substring(16, 24) === "57454250" ? "webp" : h.startsWith("47494638") ? "gif" : h.startsWith("424d") ? "bmp" : "png";
  }

  async up(buf, mtd) {
    if (!Buffer.isBuffer(buf)) throw new Error("Data bukan Buffer");
    const e = this.ext(buf);
    const mime = MIME_MAP[e] ?? "image/png";
    try {
      const d = await this.ins.post("/ai/web/nologin/getuploadurl", this.form({
        ext: e,
        method: mtd
      })).then(r => r?.data);
      await axios.put(d.data.upload_url, buf, {
        headers: {
          "content-type": mime
        }
      });
      const imgUrl = d?.data?.img_url;
      return imgUrl;
    } catch (err) {
      throw err;
    }
  }

  async poll({ path, data, sl = () => false }) {
    const start = Date.now(),
      interval = 3e3,
      timeout = 6e4;
    return new Promise((resolve, reject) => {
      const check = async () => {
        if (Date.now() - start > timeout) {
          return reject(new Error("Polling timeout"));
        }
        try {
          const r = await this.ins({
            url: path,
            method: data ? "POST" : "GET",
            ...data ? { data: data } : {}
          });
          const errMsg = r?.data?.errmsg?.trim();
          if (errMsg) {
            return reject(new Error(errMsg));
          }
          if (sl(r.data)) {
            return resolve(r.data);
          }
          setTimeout(check, interval);
        } catch (err) {
          reject(err);
        }
      };
      check();
    });
  }

  async generate({ prompt = "enhance image quality", imageUrl, ...rest }) {
    try {
      let requestData = {
        prompt: prompt,
        ...rest
      };

      if (imageUrl) {
        let buf = imageUrl;
        if (typeof imageUrl === "string") {
          if (imageUrl.startsWith("http")) {
            const res = await axios.get(imageUrl, {
              responseType: "arraybuffer",
              headers: DL_HEADERS,
              timeout: 15e3,
              maxRedirects: 5
            });
            buf = Buffer.from(res.data);
          } else if (imageUrl.startsWith("data:")) {
            const b64 = imageUrl.split(",")[1] || "";
            buf = Buffer.from(b64, "base64");
          } else {
            buf = Buffer.from(imageUrl, "base64");
          }
        }
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
          throw new Error("Gambar tidak valid atau kosong");
        }
        const uploadedUrl = await this.up(buf, "wn_aistyle_nano");
        requestData.url = uploadedUrl;
      }

      const taskRes = await this.ins.post("/ai/nano/upload", this.form(requestData)).then(r => r?.data);
      const taskId = taskRes?.task_id;
      if (!taskId) throw new Error("Task ID tidak ditemukan");
      
      const result = await this.poll({
        path: `/ai/nano/get_result/${taskId}`,
        sl: d => d?.code === 0 && !!d?.image_url
      });
      
      return result;
    } catch (err) {
      throw err;
    }
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

app.post('/api/grid-plus', async (req, res) => {
  const params = req.body;
  
  if (!params.prompt) {
    return res.status(400).json({
      error: "Input 'prompt' wajib diisi."
    });
  }

  try {
    const api = new GridPlus();
    const response = await api.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});