import React, { useState, useRef, useEffect } from "react";
import {
	Download,
	Copy,
	Loader2,
	Music,
	Video,
	Sparkles,
	Image as ImageIcon,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
	const [url, setUrl] = useState("");
	const [loading, setLoading] = useState(false);
	const [isDownloading, setIsDownloading] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [result, setResult] = useState<any>(null);
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const resultRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (result) {
			setTimeout(() => {
				resultRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
			}, 100);
		}
	}, [result]);

	const handlePaste = async () => {
		try {
			const text = await navigator.clipboard.readText();
			setUrl(text);
			setError("");
		} catch (err) {
			console.error("Failed to read clipboard contents: ", err);
			setError(
				"Browser mencegah akses clipboard otomatis. Silakan paste manual (Ctrl+V / Tahan & Tempel).",
			);
		}
	};

	const handleDownload = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url) {
			setError("Masukkan tautan video TikTok terlebih dahulu.");
			return;
		}

		if (!url.includes("tiktok.com")) {
			setError("Tautan tidak valid. Pastikan itu adalah tautan TikTok.");
			return;
		}

		setLoading(true);
		setError("");
		setResult(null);

		try {
			let data: any = null;
			let lastErrorMessage = "";

			// 1. Coba lewat backend server (Railway IP)
			try {
				const response = await fetch("/api/download", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url }),
				});

				const contentType = response.headers.get("content-type");
				if (contentType && contentType.includes("application/json")) {
					const json = await response.json();
					if (response.ok && json.data) {
						data = json;
					} else {
						lastErrorMessage = json.error || json.msg || "";
					}
				}
			} catch (serverErr) {
				console.warn("Backend fetch error:", serverErr);
			}

			// 2. Jika gagal, coba langsung dari client browser (Bypass server IP)
			if (!data) {
				try {
					console.warn("Mencoba direct fetch client...");
					const targetApi = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
					const directResponse = await fetch(targetApi, {
						headers: { Accept: "application/json" },
					});
					if (directResponse.ok) {
						const json = await directResponse.json();
						if (json.code === 0 && json.data) {
							data = json;
						} else if (!lastErrorMessage && json.msg) {
							lastErrorMessage = json.msg;
						}
					}
				} catch (clientErr) {
					console.warn("Direct fetch error:", clientErr);
				}
			}

			// 3. Jika masih gagal, coba lewat proxy (AllOrigins)
			if (!data) {
				try {
					console.warn("Mencoba fetch via proxy...");
					const targetApi = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
					const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetApi)}`;
					const proxyResponse = await fetch(proxyUrl);
					if (proxyResponse.ok) {
						const json = await proxyResponse.json();
						if (json.code === 0 && json.data) {
							data = json;
						}
					}
				} catch (proxyErr) {
					console.warn("Proxy fetch error:", proxyErr);
				}
			}

			if (data && data.code === 0 && data.data) {
				let extractedImages =
					data.data.images || data.data.image_post?.images || [];
				if (typeof extractedImages === "string")
					extractedImages = [extractedImages];
				if (!Array.isArray(extractedImages)) extractedImages = [];

				setResult({
					title: data.data.title,
					cover: data.data.cover,
					play: data.data.play,
					hdplay: data.data.hdplay,
					music: data.data.music,
					images: extractedImages,
					author: {
						nickname: data.data.author?.nickname || "TikTok User",
						avatar: data.data.author?.avatar || "",
					},
				});
				setCurrentImageIndex(0);
			} else {
				throw new Error(
					lastErrorMessage ||
					data?.msg ||
						"Gagal mengambil data dari TikTok. Pastikan link video/slide valid.",
				);
			}
		} catch (err: any) {
			setError(err.message || "Terjadi kesalahan saat memproses video.");
		} finally {
			setLoading(false);
		}
	};

	const downloadFile = async (fileUrl: string, filename: string) => {
		try {
			setIsDownloading(filename);
			let response = await fetch(
				`/api/stream?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`,
			);

			let contentType = response.headers.get("content-type");
			if (!response.ok || (contentType && contentType.includes("text/html"))) {
				await new Promise((r) => setTimeout(r, 1000));
				response = await fetch(
					`/api/stream?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`,
				);
				contentType = response.headers.get("content-type");
			}

			if (!response.ok || (contentType && contentType.includes("text/html"))) {
				throw new Error("Streaming proxy not available (static hosting)");
			}

			const blob = await response.blob();

			let finalFilename = filename;
			const resContentType = response.headers.get("content-type");
			if (resContentType) {
				if (resContentType.includes("webp")) {
					finalFilename = filename.replace(/\.[^/.]+$/, ".webp");
				} else if (
					resContentType.includes("jpeg") ||
					resContentType.includes("jpg")
				) {
					finalFilename = filename.replace(/\.[^/.]+$/, ".jpg");
				} else if (resContentType.includes("png")) {
					finalFilename = filename.replace(/\.[^/.]+$/, ".png");
				}
			}

			// If the file is surprisingly small for a media file (corrupted or error response from tikwm)
			const isImage = finalFilename.match(/\.(jpg|jpeg|png|webp)$/i);
			if (blob.size < 20000 && !isImage) {
				await new Promise((r) => setTimeout(r, 1500));
				const retryRes = await fetch(
					`/api/stream?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`,
				);
				const retryContentType = retryRes.headers.get("content-type");
				if (
					retryRes.ok &&
					(!retryContentType || !retryContentType.includes("text/html"))
				) {
					const retryBlob = await retryRes.blob();
					if (retryBlob.size > blob.size) {
						const url = window.URL.createObjectURL(retryBlob);
						const a = document.createElement("a");
						a.href = url;
						a.download = finalFilename;
						document.body.appendChild(a);
						a.click();
						window.URL.revokeObjectURL(url);
						document.body.removeChild(a);
						return;
					}
				}
			}

			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = finalFilename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (e) {
			console.warn(
				"Streaming proxy failed or not available (static host). Trying client-side direct link open...",
				e,
			);
			// Fallback: open URL in a new tab so user can download directly or save manually
			try {
				const a = document.createElement("a");
				a.href = fileUrl;
				a.target = "_blank";
				a.rel = "noopener noreferrer";
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			} catch (err) {
				window.open(fileUrl, "_blank");
			}
		} finally {
			setIsDownloading(null);
		}
	};

	return (
		<div className="min-h-screen font-sans text-slate-800 flex flex-col relative overflow-hidden bg-slate-50">
			{/* Animated Soft Mesh Gradient Background Container */}
			<div className="absolute inset-0 pointer-events-none">
				<motion.div
					className="absolute inset-0 opacity-15"
					style={{
						background:
							"linear-gradient(135deg, #38bdf8 0%, #a78bfa 25%, #f472b6 50%, #818cf8 75%, #38bdf8 100%)",
						backgroundSize: "400% 400%",
					}}
					animate={{
						backgroundPosition: ["0% 0%", "100% 100%"],
					}}
					transition={{
						duration: 20,
						ease: "linear",
						repeat: Infinity,
						repeatType: "reverse",
					}}
				/>
				<motion.div
					animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
					transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
					className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-sky-400/20 rounded-full blur-[100px] mix-blend-multiply"
				/>
				<motion.div
					animate={{ scale: [1, 1.3, 1], x: [0, -40, 0], y: [0, -50, 0] }}
					transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
					className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-purple-400/20 rounded-full blur-[100px] mix-blend-multiply"
				/>
				<motion.div
					animate={{ scale: [1, 1.1, 1], x: [0, 30, 0], y: [0, -30, 0] }}
					transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
					className="absolute top-[20%] left-[30%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-rose-400/20 rounded-full blur-[100px] mix-blend-multiply"
				/>
			</div>

			{/* Header */}
			<header className="relative z-50">
				<div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
					<motion.div
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						className="flex items-center gap-3"
					>
						<img
							src="https://files.catbox.moe/pujdaq.png"
							alt="FPTIK Logo"
							className="w-10 h-10 object-contain drop-shadow-sm rounded-xl"
						/>
						<span className="text-2xl font-black tracking-tighter text-slate-900 mt-0.5">
							FP<span className="text-blue-600">TIK</span>
						</span>
					</motion.div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-grow flex flex-col items-center pt-24 pb-16 px-6">
				{/* Search Section */}
				<div className="w-full max-w-3xl flex flex-col items-center z-10">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="text-center mb-10"
					>
						<h1 className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.1] mb-6">
							Tiktok Downloader <br />
							<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">
								Anti Iklan
							</span>
						</h1>
						<p className="text-slate-500 text-lg sm:text-xl max-w-xl mx-auto">
							Jangan lupa di share share bub, Anti iklan bos wkwk
						</p>
					</motion.div>

					<motion.form
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.1 }}
						onSubmit={handleDownload}
						className="w-full relative"
					>
						<div className="relative flex flex-col sm:flex-row gap-3 p-2 bg-white rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
							<div className="relative flex-grow flex items-center">
								<input
									type="text"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="Tempel tautan TikTok di sini..."
									className="w-full bg-transparent pl-6 pr-24 py-4 text-slate-700 text-lg focus:outline-none placeholder:text-slate-400"
									disabled={loading}
								/>
								<AnimatePresence>
									{!url && (
										<motion.button
											initial={{ opacity: 0, scale: 0.8 }}
											animate={{ opacity: 1, scale: 1 }}
											exit={{ opacity: 0, scale: 0.8 }}
											type="button"
											onClick={handlePaste}
											className="absolute right-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
										>
											<Copy className="w-4 h-4" />
											<span className="hidden sm:inline">Paste</span>
										</motion.button>
									)}
								</AnimatePresence>
							</div>
							<button
								type="submit"
								disabled={loading}
								className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl sm:rounded-3xl transition-all flex items-center justify-center gap-2 min-w-[160px] shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-70 disabled:active:scale-100"
							>
								{loading ? (
									<Loader2 className="w-6 h-6 animate-spin" />
								) : (
									<>
										<Download className="w-5 h-5" />
										<span>Download</span>
									</>
								)}
							</button>
						</div>

						<AnimatePresence>
							{error && (
								<motion.div
									initial={{ opacity: 0, y: -10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -10 }}
									className="absolute -bottom-14 left-0 w-full text-center"
								>
									<span className="inline-block px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100 shadow-sm">
										{error}
									</span>
								</motion.div>
							)}
						</AnimatePresence>
					</motion.form>
				</div>

				{/* Dynamic Content Area */}
				<div className="w-full max-w-4xl mt-12">
					<AnimatePresence mode="wait">
						{result && (
							<motion.div
								ref={resultRef}
								key="result"
								initial={{ opacity: 0, scale: 0.95, y: 20 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								className="bg-white rounded-[2rem] p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 flex flex-col md:flex-row gap-8"
							>
								{/* Media Preview (Video or Images) */}
								<div className="w-full md:w-[320px] shrink-0 flex flex-col gap-3">
									<div className="w-full rounded-2xl overflow-hidden relative bg-slate-900 aspect-[9/16] shadow-inner group">
										{result.images && result.images.length > 0 ? (
											<>
												<img
													src={result.images[currentImageIndex]}
													alt={`Slide ${currentImageIndex + 1}`}
													className="w-full h-full object-cover"
													referrerPolicy="no-referrer"
												/>
												<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/90 pointer-events-none" />
												{result.images.length > 1 && (
													<>
														<button
															onClick={() =>
																setCurrentImageIndex((prev) =>
																	prev === 0
																		? result.images.length - 1
																		: prev - 1,
																)
															}
															className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/20 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition-all"
														>
															<ChevronLeft className="w-8 h-8" />
														</button>
														<button
															onClick={() =>
																setCurrentImageIndex((prev) =>
																	prev === result.images.length - 1
																		? 0
																		: prev + 1,
																)
															}
															className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/20 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition-all"
														>
															<ChevronRight className="w-8 h-8" />
														</button>

														{/* Dot indicators inside image at the bottom */}
														<div className="absolute bottom-20 left-0 right-0 flex justify-center px-4 pointer-events-auto z-10">
															<div className="flex gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-2 scroll-smooth items-center">
																{result.images.map((_: any, idx: number) => (
																	<button
																		key={idx}
																		onClick={() => setCurrentImageIndex(idx)}
																		className={`shrink-0 rounded-full transition-all border border-black/20 shadow-sm ${idx === currentImageIndex ? "bg-white w-2.5 h-2.5" : "bg-white/50 hover:bg-white/80 w-2 h-2"}`}
																		aria-label={`Go to slide ${idx + 1}`}
																	/>
																))}
															</div>
														</div>
													</>
												)}
											</>
										) : (
											<>
												<img
													src={result.cover}
													alt="Video cover"
													className="w-full h-full object-cover opacity-90"
													referrerPolicy="no-referrer"
												/>
												<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/90 pointer-events-none" />
											</>
										)}

										<div className="absolute bottom-4 left-4 right-4 pointer-events-none z-10">
											<div className="flex items-center gap-3 mb-2">
												<img
													src={result.author.avatar}
													alt="Author"
													className="w-10 h-10 rounded-full border-2 border-white/20 shadow-sm"
													referrerPolicy="no-referrer"
												/>
												<span className="font-semibold text-white truncate text-sm drop-shadow-md">
													@{result.author.nickname}
												</span>
											</div>
											<p className="text-white/90 text-xs line-clamp-2 leading-relaxed drop-shadow-md">
												{result.title}
											</p>
										</div>
									</div>

									{result.images && result.images.length > 0 && (
										<button
											onClick={() =>
												downloadFile(
													result.images[currentImageIndex],
													`fptik_image_${currentImageIndex + 1}.jpg`,
												)
											}
											disabled={isDownloading !== null}
											className="w-full bg-[#5bb2ed] hover:bg-[#4a9dcf] text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
										>
											{isDownloading ===
											`fptik_image_${currentImageIndex + 1}.jpg` ? (
												<Loader2 className="w-5 h-5 animate-spin" />
											) : (
												<Download className="w-5 h-5" />
											)}
											Unduh Foto Ini
										</button>
									)}
								</div>

								{/* Download Options */}
								<div className="flex-grow flex flex-col justify-center space-y-4 py-4">
									<h3 className="text-xl font-bold text-slate-900 mb-2 px-2">
										Pilih Format Unduhan
									</h3>

									{result.images && result.images.length > 0 && (
										<button
											onClick={() =>
												downloadFile(
													result.images[currentImageIndex],
													`fptik_image_${currentImageIndex + 1}.jpg`,
												)
											}
											disabled={isDownloading !== null}
											className="w-full bg-[#5bb2ed] hover:bg-[#4a9dcf] text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-md flex items-center justify-between group disabled:opacity-70 disabled:cursor-not-allowed"
										>
											<div className="flex items-center gap-4">
												<div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white transition-colors">
													<ImageIcon className="w-5 h-5" />
												</div>
												<span className="text-left">
													<span className="block text-sm">Unduh Foto Ini</span>
													<span className="block text-xs font-medium text-blue-50">
														Slide {currentImageIndex + 1}
													</span>
												</span>
											</div>
											{isDownloading ===
											`fptik_image_${currentImageIndex + 1}.jpg` ? (
												<Loader2 className="w-5 h-5 animate-spin" />
											) : (
												<Download className="w-5 h-5 opacity-70 group-hover:opacity-100" />
											)}
										</button>
									)}

									{result.play &&
										(!result.images || result.images.length === 0) && (
											<button
												onClick={() =>
													downloadFile(result.play, "fptik_video.mp4")
												}
												disabled={isDownloading !== null}
												className="w-full bg-[#5bb2ed] hover:bg-[#4a9dcf] text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-md flex items-center justify-between group disabled:opacity-70 disabled:cursor-not-allowed"
											>
												<div className="flex items-center gap-4">
													<div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white transition-colors">
														<Video className="w-5 h-5" />
													</div>
													<span className="text-left">
														<span className="block text-sm">
															Download as video
														</span>
														<span className="block text-xs font-medium text-blue-50">
															Kualitas Standar (MP4)
														</span>
													</span>
												</div>
												{isDownloading === "fptik_video.mp4" ? (
													<Loader2 className="w-5 h-5 animate-spin" />
												) : (
													<Download className="w-5 h-5 opacity-70 group-hover:opacity-100" />
												)}
											</button>
										)}

									{result.music && (
										<button
											onClick={() =>
												downloadFile(result.music, "fptik_audio.mp3")
											}
											disabled={isDownloading !== null}
											className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold py-4 px-6 rounded-2xl transition-all border border-slate-200 flex items-center justify-between group disabled:opacity-70 disabled:cursor-not-allowed"
										>
											<div className="flex items-center gap-4">
												<div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-slate-700 transition-colors">
													<Music className="w-5 h-5" />
												</div>
												<span className="text-left">
													<span className="block text-sm">Hanya Audio</span>
													<span className="block text-xs font-normal text-slate-500">
														Musik atau Suara Asli (MP3)
													</span>
												</span>
											</div>
											{isDownloading === "fptik_audio.mp3" ? (
												<Loader2 className="w-5 h-5 animate-spin text-slate-500" />
											) : (
												<Download className="w-5 h-5 opacity-40 group-hover:opacity-100" />
											)}
										</button>
									)}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</main>

			<footer className="py-8 text-center text-slate-400 text-sm mt-auto z-10">
				<p className="font-medium">
					&copy; {new Date().getFullYear()} FPTIK | FellProject.
				</p>
			</footer>
		</div>
	);
}
