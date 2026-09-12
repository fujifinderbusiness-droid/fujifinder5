import { CameraProduct, Article, MediaAsset, SiteSettings, HomePageSettings } from '../types';

export const initialSiteSettings: SiteSettings = {
  siteName: 'FujiFinder',
  tagline: 'The Independent Journal of Camera Craft & Gear Intelligence',
  siteUrl: 'https://www.fujifinder.my.id',
  homeSlug: '', // default root '/'
  camerasSlug: 'cameras',
  blogSlug: 'blog',
  cameraSlugPrefix: 'camera',
  blogSlugPrefix: '/article/',
  affiliateDisclosureText: 'FujiFinder is an independent, reader-supported photography journal. When you buy through our links, we may earn an affiliate commission at no extra cost to you. We purchase or borrow our test gear independently and do not accept sponsored reviews.',
  amazonAssociateTag: 'fujifinder-20',
  bhPhotoTag: 'fujifinder_bh',
  contactEmail: 'fujifinderbusiness@gmail.com',
  currencySymbol: '$',
  enableClickTracking: true,
};

export const initialHomePageSettings: HomePageSettings = {
  heroMode: 'dynamic',
  heroSlides: [
    {
      id: 'slide-1',
      badge: 'FEATURED STORY',
      date: 'May 20, 2026',
      headline: 'Capture More.\nCreate Better.',
      subtitle: 'The Right Camera for Every Story',
      description: 'Discover the best cameras, in-depth reviews, and expert guides to help you capture your world in stunning detail.',
      image: 'https://images.unsplash.com/photo-1510127031490-569779437d68?auto=format&fit=crop&w=2000&q=85',
      storySlug: 'best-street-photography-cameras-2026',
      primaryCtaText: 'Read Story',
      secondaryCtaText: 'Katalog Review & Uji Lab',
    },
  ],
  categoriesSectionTitle: 'Review Kamera Berdasarkan Format',
  categoriesSectionSubtitle: 'Eksplorasi uji lab independen, komparasi sensor, dan panduan field photography untuk setiap sistem kamera.',
  categoryCards: [
    {
      id: 'mirrorless',
      title: 'Mirrorless',
      desc: 'Lightweight, fast and perfect for any creator.',
      image: 'https://images.unsplash.com/photo-1510127031490-569779437d68?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'Mirrorless',
    },
    {
      id: 'dslr',
      title: 'DSLR',
      desc: 'Powerful performance that never gets old.',
      image: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'DSLR',
    },
    {
      id: 'compact',
      title: 'Compact',
      desc: 'Small size, big possibilities.',
      image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'Compact',
    },
    {
      id: 'action-camera',
      title: 'Action Camera',
      desc: 'Built for adventure. Capture every moment.',
      image: 'https://images.unsplash.com/photo-1564466809058-bf4114d55352?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'Action Camera',
    },
    {
      id: 'vlogging',
      title: 'Vlogging',
      desc: 'Create content. Share your story.',
      image: 'https://images.unsplash.com/photo-1527011046414-4781f1f94f8c?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'Vlogging',
    },
    {
      id: 'accessories',
      title: 'Accessories',
      desc: 'Lenses, bags, tripods and more gear.',
      image: 'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=800&q=80',
      categoryParam: 'Accessories',
    },
  ],
  popularSectionTitle: 'Popular Now',
  reviewedCamerasBadge: '100% Ulasan Independen • Kami Menilai, Bukan Menjual Kamera',
  reviewedCamerasTitle: 'Hasil Uji Lab & Review Kamera Terbaru',
  reviewedCamerasDescription: 'FujiFinder adalah jurnal pengujian gear independen — kami tidak menjual kamera atau menerima sponsor pabrikan untuk menaikkan skor. Setiap unit kami uji langsung di lab dan lapangan nyata untuk mengevaluasi ketajaman sensor, sistem autofokus, stabilisasi gambar, serta kehandalan ergonomi bodi.',
  featuredCameraIds: [],
  transparencyBannerText: 'Pemberitahuan Transparansi: FujiFinder adalah media ulasan independen. Kami tidak menjual kamera dan tidak menerima kompensasi untuk mengubah penilaian skor uji lab.',
  methodologyBadge: 'Standar Evaluasi Jurnal',
  methodologyTitle: 'Metodologi Pengujian Kamera FujiFinder',
  methodologySubtitle: 'Setiap kamera yang kami ulas melewati protokol uji ketat selama minimal dua pekan sebelum skor akhir diterbitkan.',
  methodologyPillars: [
    {
      id: 'pillar-1',
      title: '1. Uji Sensor & Resolusi',
      description: 'Pengukuran dynamic range piksel demi piksel, reproduksi warna, dan ketahanan noise di ISO 6400 hingga 51.200 pada target studio terkalibrasi.',
    },
    {
      id: 'pillar-2',
      title: '2. Lapangan Nyata',
      description: 'Minimal 2.000 foto nyata pada genre street photography, dokumenter, potret minim cahaya, dan lanskap dinamis oleh fotografer aktif.',
    },
    {
      id: 'pillar-3',
      title: '3. Autofokus & Ergonomi',
      description: 'Evaluasi akurasi pelacakan mata AI, kecepatan shutter lag, kenyamanan grip tangan, susunan dial fisik, dan efisiensi baterai harian.',
    },
    {
      id: 'pillar-4',
      title: '4. 100% Bebas Sponsor',
      description: 'Kami tidak menerima bayaran untuk mengubah skor atau menghapus kelemahan produk. Semua kelebihan dan kekurangan diungkap secara jujur.',
    },
  ],
  newsletterHeadline: 'Get the latest camera guides, reviews, and gear recommendations.',
  newsletterSubtitle: 'Join thousands of photography enthusiasts and never miss new articles, reviews, and exclusive deals.',
  newsletterButtonText: 'Subscribe',
};

export const initialCameras: CameraProduct[] = [];

export const initialArticles: Article[] = [];

export const initialMediaAssets: MediaAsset[] = [];
