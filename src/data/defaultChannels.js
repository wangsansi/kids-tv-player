const sampleVideos = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
];

export const defaultChannelUrls = Array.from({ length: 10 }, (_, index) => {
  if (index < sampleVideos.length) {
    return sampleVideos[index];
  }
  return "";
});
