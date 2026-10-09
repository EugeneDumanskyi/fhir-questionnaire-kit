// The app serves no images, so Next.js never loads its optional image
// optimiser (sharp).
export default { images: { unoptimized: true } };
