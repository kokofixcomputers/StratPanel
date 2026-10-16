<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>{{ config('app.name', 'Stratosphere') }} - @yield('title')</title>
        <meta content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" name="viewport">
        <meta name="_token" content="{{ csrf_token() }}">

        @include('partials.favicon')
        <meta name="theme-color" content="#ffffff">

        @include('layouts.scripts')

        @section('scripts')
            {!! Theme::css('vendor/select2/select2.min.css?t={cache-version}') !!}
            {!! Theme::css('vendor/bootstrap/bootstrap.min.css?t={cache-version}') !!}
            {!! Theme::css('vendor/adminlte/admin.min.css?t={cache-version}') !!}
            {!! Theme::css('vendor/adminlte/colors/skin-blue.min.css?t={cache-version}') !!}
            {!! Theme::css('vendor/sweetalert/sweetalert.min.css?t={cache-version}') !!}
            {!! Theme::css('vendor/animate/animate.min.css?t={cache-version}') !!}
            {!! Theme::css('css/pterodactyl.css?t={cache-version}') !!}
            {{-- The file's modification time busts browser and proxy caches whenever the theme changes. --}}
            <link media="all" type="text/css" rel="stylesheet" href="/themes/pterodactyl/css/admin-modern.css?v={{ filemtime(public_path('themes/pterodactyl/css/admin-modern.css')) }}">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/ionicons/2.0.1/css/ionicons.min.css">

            <!--[if lt IE 9]>
            <script src="https://oss.maxcdn.com/html5shiv/3.7.3/html5shiv.min.js"></script>
            <script src="https://oss.maxcdn.com/respond/1.4.2/respond.min.js"></script>
            <![endif]-->
        @show
    </head>
    <body class="hold-transition admin-modern">
        <div class="wrapper admin-shell">
            <aside class="admin-sidebar">
                <a href="{{ route('admin.index') }}" class="admin-brand">
                    <span class="logo-mark"><img src="{{ $favicon ?: '/favicons/android-chrome-192x192.png' }}" alt=""></span>
                    <span class="logo-text">{{ config('app.name', 'Stratosphere') }}</span>
                    <span class="logo-badge">Admin</span>
                </a>
                <nav class="admin-nav">
                    @php($adminUser = Auth::user())
                    <ul class="admin-nav-list">
                        @if($adminUser->hasPermission('overview.view'))
                        <li class="{{ Route::currentRouteName() !== 'admin.index' ?: 'active' }}">
                            <a href="{{ route('admin.index') }}"><span class="nav-chip c-blue"><i class="fa fa-home"></i></span> <span>Overview</span></a>
                        </li>
                        @endif
                        @if(\Pterodactyl\Services\Roles\AdminNavigation::hasSettings($adminUser))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.settings') ?: 'active' }}">
                            <a href="{{ route(\Pterodactyl\Services\Roles\AdminNavigation::settingsHome($adminUser)) }}"><span class="nav-chip c-slate"><i class="fa fa-wrench"></i></span> <span>Settings</span></a>
                        </li>
                        @endif
                        @if($adminUser->root_admin)
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.api') ?: 'active' }}">
                            <a href="{{ route('admin.api.index') }}"><span class="nav-chip c-violet"><i class="fa fa-gamepad"></i></span> <span>Application API</span></a>
                        </li>
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.updates') ?: 'active' }}">
                            <a href="{{ route('admin.updates') }}"><span class="nav-chip c-violet"><i class="fa fa-cloud-download"></i></span> <span>Updates</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasAnyPermission('databases.view', 'locations.view', 'nodes.view'))
                        <li class="nav-heading">Infrastructure</li>
                        @endif
                        @if($adminUser->hasPermission('databases.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.databases') ?: 'active' }}">
                            <a href="{{ route('admin.databases') }}"><span class="nav-chip c-amber"><i class="fa fa-database"></i></span> <span>Databases</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('locations.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.locations') ?: 'active' }}">
                            <a href="{{ route('admin.locations') }}"><span class="nav-chip c-teal"><i class="fa fa-globe"></i></span> <span>Locations</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('nodes.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.nodes') ?: 'active' }}">
                            <a href="{{ route('admin.nodes') }}"><span class="nav-chip c-green"><i class="fa fa-sitemap"></i></span> <span>Nodes</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasAnyPermission('servers.view', 'users.view', 'roles.view', 'mounts.view', 'nests.view', 'extensions.view'))
                        <li class="nav-heading">Management</li>
                        @endif
                        @if($adminUser->hasPermission('servers.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.servers') ?: 'active' }}">
                            <a href="{{ route('admin.servers') }}"><span class="nav-chip c-indigo"><i class="fa fa-server"></i></span> <span>Servers</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('users.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.users') ?: 'active' }}">
                            <a href="{{ route('admin.users') }}"><span class="nav-chip c-pink"><i class="fa fa-users"></i></span> <span>Users</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('roles.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.roles') ?: 'active' }}">
                            <a href="{{ route('admin.roles') }}"><span class="nav-chip c-red"><i class="fa fa-shield"></i></span> <span>Roles</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('mounts.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.mounts') ?: 'active' }}">
                            <a href="{{ route('admin.mounts') }}"><span class="nav-chip c-orange"><i class="fa fa-magic"></i></span> <span>Mounts</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('nests.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.nests') ?: 'active' }}">
                            <a href="{{ route('admin.nests') }}"><span class="nav-chip c-cyan"><i class="fa fa-th-large"></i></span> <span>Nests</span></a>
                        </li>
                        @endif
                        @if($adminUser->hasPermission('extensions.view'))
                        <li class="{{ ! starts_with(Route::currentRouteName(), 'admin.extensions') ?: 'active' }}">
                            <a href="{{ route('admin.extensions') }}"><span class="nav-chip c-violet"><i class="fa fa-puzzle-piece"></i></span> <span>Extensions</span></a>
                        </li>
                        @endif
                    </ul>
                </nav>
                <div class="admin-user">
                    <a href="{{ route('account') }}" class="admin-user-link" data-toggle="tooltip" data-placement="top" title="Account Settings">
                        <img src="https://www.gravatar.com/avatar/{{ md5(strtolower(Auth::user()->email)) }}?s=160" class="user-image" alt="User Image">
                        <span class="admin-user-name">{{ Auth::user()->username }}</span>
                    </a>
                    <a href="{{ route('index') }}" class="admin-user-action" data-toggle="tooltip" data-placement="top" title="Exit Admin Control"><i class="fa fa-server"></i></a>
                    <a href="{{ route('auth.logout') }}" id="logoutButton" class="admin-user-action" data-toggle="tooltip" data-placement="top" title="Logout"><i class="fa fa-sign-out"></i></a>
                </div>
            </aside>
            <div class="content-wrapper">
                <section class="content-header">
                    @yield('content-header')
                </section>
                <section class="content">
                    <div class="row">
                        <div class="col-xs-12">
                            @include('admin.partials.ui-update')
                            @if (count($errors) > 0)
                                <div class="alert alert-danger">
                                    There was an error validating the data provided.<br><br>
                                    <ul>
                                        @foreach ($errors->all() as $error)
                                            <li>{{ $error }}</li>
                                        @endforeach
                                    </ul>
                                </div>
                            @endif
                            @foreach (Alert::getMessages() as $type => $messages)
                                @foreach ($messages as $message)
                                    <div class="alert alert-{{ $type }} alert-dismissable" role="alert">
                                        {{ $message }}
                                    </div>
                                @endforeach
                            @endforeach
                        </div>
                    </div>
                    @yield('content')
                </section>
            </div>
            <footer class="main-footer">
                <div class="pull-right small text-gray">
                    <strong><i class="fa fa-fw {{ $appIsGit ? 'fa-git-square' : 'fa-code-fork' }}"></i></strong> {{ $appVersion }}<br />
                    <strong><i class="fa fa-fw fa-clock-o"></i></strong> {{ round(microtime(true) - LARAVEL_START, 3) }}s
                </div>
                Stratosphere &copy; {{ date('Y') }}. Built on <a href="https://pterodactyl.io/">Pterodactyl</a>, &copy; 2015 - {{ date('Y') }} Pterodactyl Software.
            </footer>
        </div>
        @section('footer-scripts')
            <script src="/js/keyboard.polyfill.js" type="application/javascript"></script>
            <script>keyboardeventKeyPolyfill.polyfill();</script>

            {!! Theme::js('vendor/jquery/jquery.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/sweetalert/sweetalert.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/bootstrap/bootstrap.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/slimscroll/jquery.slimscroll.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/adminlte/app.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/bootstrap-notify/bootstrap-notify.min.js?t={cache-version}') !!}
            {!! Theme::js('vendor/select2/select2.full.min.js?t={cache-version}') !!}
            {!! Theme::js('js/admin/functions.js?t={cache-version}') !!}
            <script src="/js/autocomplete.js" type="application/javascript"></script>

            @if(Auth::user()->canAccessAdmin())
                <script>
                    $('#logoutButton').on('click', function (event) {
                        event.preventDefault();

                        var that = this;
                        swal({
                            title: 'Do you want to log out?',
                            type: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#d9534f',
                            cancelButtonColor: '#d33',
                            confirmButtonText: 'Log out'
                        }, function () {
                             $.ajax({
                                type: 'POST',
                                url: '{{ route('auth.logout') }}',
                                data: {
                                    _token: '{{ csrf_token() }}'
                                },complete: function () {
                                    window.location.href = '{{route('auth.login')}}';
                                }
                        });
                    });
                });
                </script>
            @endif

            <script>
                $(function () {
                    $('[data-toggle="tooltip"]').tooltip();
                })
            </script>
        @show
    </body>
</html>
