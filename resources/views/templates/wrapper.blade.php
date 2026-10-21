<!DOCTYPE html>
<html>
    <head>
        <title>{{ ($seo['title'] ?? '') !== '' ? $seo['title'] : config('app.name', 'Stratosphere') }}</title>

        @section('meta')
            <meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" name="viewport">
            <meta name="csrf-token" content="{{ csrf_token() }}">
            @include('partials.favicon')
            {{-- An admin's own colour is kept, otherwise the script of the theme colours the bar of the browser for light and dark. --}}
            <meta name="theme-color" content="{{ ($seo['theme_color'] ?? '') !== '' ? $seo['theme_color'] : '#ffffff' }}" @if(($seo['theme_color'] ?? '') !== '') data-fixed @endif>
            @include('partials.seo')
        @show
        @include('partials.theme')

        @section('user-data')
            @if(!is_null(Auth::user()))
                <script>
                    window.PterodactylUser = {!! json_encode(Auth::user()->toVueObject()) !!};
                </script>
            @endif
            @if(!empty($siteConfiguration))
                <script>
                    window.SiteConfiguration = {!! json_encode($siteConfiguration) !!};
                </script>
            @endif
        @show

        @yield('assets')

        @include('layouts.scripts')
    </head>
    <body class="{{ $css['body'] ?? 'bg-neutral-50' }}">
        @section('content')
            @yield('above-container')
            @yield('container')
            @yield('below-container')
        @show
        @section('scripts')
            {!! $asset->js('main.js') !!}
        @show
    </body>
</html>
