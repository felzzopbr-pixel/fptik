import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Readable } from "stream";

async function startServer() {
	const app = express();
	const PORT = process.env.PORT || 3000;

	app.use(express.json());

	// API Route to fetch TikTok data
	app.post("/api/download", async (req, res) => {
		try {
			const { url } = req.body;
			if (!url) {
				return res.status(400).json({ error: "URL is required" });
			}

			// Validate URL format roughly
			if (!url.includes("tiktok.com")) {
				return res.status(400).json({ error: "Invalid TikTok URL" });
			}

			// Fetch from TikWM API
			// Sometimes hd=1 drops image array for photo slides, let's try without it
			const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
			const response = await fetch(apiUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "application/json, text/plain, */*",
				},
			});

			const contentType = response.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				const text = await response.text();
				console.error("Non-JSON response from TikWM:", text.substring(0, 150));
				return res
					.status(502)
					.json({
						error:
							"Server TikTok (TikWM) mengembalikan format yang tidak valid (Mungkin diblokir).",
					});
			}

			const data = await response.json();

			if (data.code === 0 && data.data) {
				// Tikwm sometimes places images in different properties, or it could be a single string
				let extractedImages =
					data.data.images || data.data.image_post?.images || [];
				if (typeof extractedImages === "string")
					extractedImages = [extractedImages];
				if (!Array.isArray(extractedImages)) extractedImages = [];

				res.json({
					title: data.data.title,
					cover: data.data.cover,
					play: data.data.play,
					hdplay: data.data.hdplay,
					music: data.data.music,
					images: extractedImages,
					author: {
						nickname: data.data.author.nickname,
						avatar: data.data.author.avatar,
					},
				});
			} else {
				res
					.status(400)
					.json({
						error:
							data.msg ||
							"Gagal mengambil data dari TikTok (Mungkin video private atau dihapus).",
					});
			}
		} catch (error: any) {
			console.error("Download error:", error);
			res
				.status(500)
				.json({
					error: error.message || "Internal server error. Please try again.",
				});
		}
	});

	// Proxy route to download files with attachment headers
	app.get("/api/stream", async (req, res) => {
		try {
			const { url, filename } = req.query;
			if (!url || typeof url !== "string") {
				return res.status(400).json({ error: "URL is required" });
			}

			const fetchWithRetry = async (
				targetUrl: string,
				retries: number = 2,
			): Promise<Response> => {
				for (let i = 0; i <= retries; i++) {
					const response = await fetch(targetUrl, {
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
							Referer: "https://www.tiktok.com/",
						},
					});

					if (!response.ok) {
						if (i === retries)
							throw new Error(`Failed to fetch media: ${response.statusText}`);
						await new Promise((r) => setTimeout(r, 1000));
						continue;
					}

					const contentType = response.headers.get("content-type");
					const contentLength =
						Number(response.headers.get("content-length")) || 0;
					const isImage =
						(typeof filename === "string" &&
							filename.match(/\.(jpg|jpeg|png|webp)$/i)) ||
						(contentType && contentType.startsWith("image/"));

					// If it's returning HTML instead of media, or file is suspiciously small (< 20KB for a video/audio), retry
					if (
						(contentType && contentType.includes("text/html")) ||
						(!isImage && contentLength > 0 && contentLength < 20000)
					) {
						if (i === retries)
							throw new Error("Received invalid content (HTML or too small)");
						await new Promise((r) => setTimeout(r, 1000));
						continue;
					}

					return response;
				}
				throw new Error("Unreachable");
			};

			const response = await fetchWithRetry(url, 2);

			const contentType = response.headers.get("content-type");
			if (contentType) {
				res.setHeader("Content-Type", contentType);
			}

			const contentLength = response.headers.get("content-length");
			if (contentLength) {
				res.setHeader("Content-Length", contentLength);
			}

			const fname =
				filename && typeof filename === "string" ? filename : "download";
			res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

			if (response.body) {
				Readable.fromWeb(response.body as any).pipe(res);
			} else {
				res.status(404).send("Not found");
			}
		} catch (error) {
			console.error("Stream error:", error);
			if (!res.headersSent) {
				res.status(500).json({ error: "Failed to download file" });
			}
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
