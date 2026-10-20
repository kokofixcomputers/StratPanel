{{-- Sets the theme (light or dark) before anything is drawn, so a page never flashes the wrong one. The choice is the one the panel keeps in
     the browser (resources/scripts/lib/theme.ts), "system" follows the device. --}}
<script>
    (function () {
        try {
            var choice = localStorage.getItem('stratosphere:theme') || @json($themeConfig['mode'] ?? 'system');
            var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
            var root = document.documentElement;
            root.setAttribute('data-chrome', @json($themeConfig['chrome'] ?? 'attached'));
            root.setAttribute('data-nav', @json($themeConfig['nav'] ?? 'tint'));
            root.classList.toggle('dark', dark);
            root.setAttribute('data-theme', dark ? 'dark' : 'light');
            var bar = document.querySelector('meta[name="theme-color"]');
            if (bar) bar.setAttribute('content', dark ? '#141a23' : '#ffffff');
        } catch (e) {}
    })();
</script>
<style>
    html.dark { background: #0c1017; color-scheme: dark; }
</style>
@if(!empty($themeCss))
    {{-- The look an admin built in the theme editor, checked by Services/Theme/ThemeService.php: only CSS variables. --}}
    <style id="stratosphere-custom-theme">{!! $themeCss !!}</style>
@endif
