{{-- What search engines, shared links and an installed app know about the panel. The settings are under Settings > Theme editor > Search and sharing
     (Services/Branding/BrandingService.php). An empty setting means the name of the panel. --}}
@php
    $siteName = config('app.name', 'Stratosphere');
    $pageTitle = ($seo['title'] ?? '') !== '' ? $seo['title'] : $siteName;
    $description = $seo['description'] ?? '';
    $image = $seo['share_image'] ?? '';
    $imageUrl = $image === '' ? '' : (str_starts_with($image, '/') ? url($image) : $image);
@endphp
<meta name="robots" content="{{ ($seo['index'] ?? false) ? 'index, follow' : 'noindex' }}">
@if($description !== '')
    <meta name="description" content="{{ $description }}">
@endif
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{ $siteName }}">
<meta property="og:title" content="{{ $pageTitle }}">
@if($description !== '')
    <meta property="og:description" content="{{ $description }}">
@endif
@if($imageUrl !== '')
    <meta property="og:image" content="{{ $imageUrl }}">
@endif
<meta name="twitter:card" content="{{ $imageUrl !== '' ? 'summary_large_image' : 'summary' }}">
<meta name="twitter:title" content="{{ $pageTitle }}">
@if($description !== '')
    <meta name="twitter:description" content="{{ $description }}">
@endif
@if($imageUrl !== '')
    <meta name="twitter:image" content="{{ $imageUrl }}">
@endif
<meta name="apple-mobile-web-app-title" content="{{ ($seo['app_short_name'] ?? '') !== '' ? $seo['app_short_name'] : (($seo['app_name'] ?? '') !== '' ? $seo['app_name'] : $siteName) }}">
<link rel="manifest" href="/manifest.webmanifest">
