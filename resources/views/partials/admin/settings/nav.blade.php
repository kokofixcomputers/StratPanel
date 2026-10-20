@include('partials/admin.settings.notice')

@section('settings::nav')
    @yield('settings::notice')
    <div class="row">
        <div class="col-xs-12">
            <div class="nav-tabs-custom nav-tabs-floating">
                <ul class="nav nav-tabs">
                    @if(Auth::user()->hasPermission('settings.general.view'))
                    <li @if($activeTab === 'basic')class="active"@endif><a href="{{ route('admin.settings') }}">General</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.branding.view'))
                    <li @if($activeTab === 'branding')class="active"@endif><a href="{{ route('admin.settings.branding') }}">Branding</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.branding.update'))
                    {{-- The theme editor is a page of the React panel, not of this admin area. --}}
                    <li><a href="/theme-editor">Theme editor <i class="fa fa-external-link" style="font-size:11px;"></i></a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.authentication.view'))
                    <li @if($activeTab === 'authentication')class="active"@endif><a href="{{ route('admin.settings.authentication') }}">Authentication</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.providers.view'))
                    <li @if($activeTab === 'providers')class="active"@endif><a href="{{ route('admin.settings.providers') }}">Providers</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.curseforge.view'))
                    <li @if($activeTab === 'curseforge')class="active"@endif><a href="{{ route('admin.settings.curseforge') }}">CurseForge</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.certificates.view'))
                    <li @if($activeTab === 'certificates')class="active"@endif><a href="{{ route('admin.settings.certificates') }}">Certificates</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.domains.view'))
                    <li @if($activeTab === 'domains')class="active"@endif><a href="{{ route('admin.settings.domains') }}">Domains</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.trash.view'))
                    <li @if($activeTab === 'trash')class="active"@endif><a href="{{ route('admin.settings.trash') }}">Trash</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.mail.view'))
                    <li @if($activeTab === 'mail')class="active"@endif><a href="{{ route('admin.settings.mail') }}">Mail</a></li>
                    @endif
                    @if(Auth::user()->hasPermission('settings.advanced.view'))
                    <li @if($activeTab === 'advanced')class="active"@endif><a href="{{ route('admin.settings.advanced') }}">Advanced</a></li>
                    @endif
                </ul>
            </div>
        </div>
    </div>
@endsection
