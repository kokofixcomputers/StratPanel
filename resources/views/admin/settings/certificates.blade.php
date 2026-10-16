@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'certificates'])

@section('title')
    Certificates
@endsection

@section('content-header')
    <h1>Certificates<small>Serve the panel over https with certificates you add here.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    @php($canChange = Auth::user()->hasPermission('settings.certificates.update'))
    <div class="row">
        <div class="col-md-7">
            <div class="box">
                <div class="box-header with-border"><h3 class="box-title">Certificates</h3></div>
                @if($certificates->isEmpty())
                    <div class="box-body"><p class="text-muted no-margin">No certificates yet. Add one on the right.</p></div>
                @else
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover">
                            <thead><tr><th>Name</th><th>Covers</th><th>Ends</th><th></th></tr></thead>
                            <tbody>
                                @foreach($certificates as $certificate)
                                    <tr>
                                        <td>
                                            <a href="{{ route('admin.settings.certificates.edit', $certificate->id) }}">{{ $certificate->name }}</a>
                                            @if($certificate->is_default)<span class="label label-primary" title="Used for names no certificate covers, and for the IP address">Default</span>@endif
                                            @if(!$certificate->enabled)<span class="label label-default">Off</span>@endif
                                            @if($certificate->source === 'letsencrypt')@if($certificate->acme_method === 'dns')<span class="label label-success" title="Made with a TXT record added by hand: it is not renewed by itself">Let's Encrypt (DNS)</span>@else<span class="label label-success" title="Made and renewed by the panel">Let's Encrypt</span>@endif @endif
                                            @if($certificate->renew_error)<span class="label label-danger" title="{{ $certificate->renew_error }}">Renewal failed</span>@endif
                                            @if(app(\Pterodactyl\Services\Certificates\CertificateService::class)->lacksIntermediates($certificate))<span class="label label-warning" title="Add the full chain (fullchain.pem): some clients do not find the intermediate certificates themselves">No chain</span>@endif
                                        </td>
                                        <td>
                                            @foreach(array_slice($certificate->domains, 0, 4) as $domain)<code>{{ $domain }}</code> @endforeach
                                            @if(count($certificate->domains) > 4)<span class="text-muted small">+{{ count($certificate->domains) - 4 }} more</span>@endif
                                        </td>
                                        <td>
                                            @if($certificate->isExpired())
                                                <span class="label label-danger">Expired</span>
                                            @elseif($certificate->isExpiring())
                                                <span class="label label-warning">{{ $certificate->daysLeft() }} days left</span>
                                            @else
                                                <span class="text-muted small">{{ $certificate->not_after?->toDateString() }} ({{ $certificate->daysLeft() }} days)</span>
                                            @endif
                                        </td>
                                        <td class="text-right"><a href="{{ route('admin.settings.certificates.edit', $certificate->id) }}" class="btn btn-xs btn-default">Open</a></td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @endif
            </div>
            <div class="box">
                <div class="box-header with-border"><h3 class="box-title">How it is served</h3></div>
                <div class="box-body">
                    <p class="text-muted">
                        The panel itself (PHP) can not do https, so a small program next to it does:
                        <code>panel-edge</code> listens on port 443, picks the certificate that belongs to the name the visitor used (wildcards too),
                        and passes the request on to the web server of the panel. It asks the panel for the certificates every minute, so what you
                        add, replace or delete here is in use within a minute and nothing has to be restarted.
                    </p>
                    @if(!$tokenConfigured)
                        <div class="alert alert-warning no-margin-bottom">
                            It is not set up on this machine. Run <code>sudo bash tools/panel-edge/install.sh</code> in the folder of the panel, it installs the program,
                            makes the secret (<code>PTERODACTYL_CERTIFICATES_TOKEN</code>) and starts it.
                        </div>
                    @elseif($edge === null)
                        <div class="alert alert-warning no-margin-bottom">
                            The secret is set but panel-edge has not asked for certificates yet. Is it running? <code>systemctl status panel-edge</code>
                            (<code>sudo bash tools/panel-edge/install.sh</code> installs it).
                        </div>
                    @else
                        <p class="no-margin-bottom">
                            <span class="label {{ $edge['at']->gt(now()->subMinutes(5)) ? 'label-success' : 'label-danger' }}">
                                {{ $edge['at']->gt(now()->subMinutes(5)) ? 'Connected' : 'Not seen lately' }}
                            </span>
                            panel-edge last asked {{ $edge['at']->diffForHumans() }} (from {{ $edge['ip'] }}) and was given {{ $edge['count'] }} {{ $edge['count'] === 1 ? 'certificate' : 'certificates' }}.
                        </p>
                    @endif
                </div>
            </div>
        </div>
        <div class="col-md-5">
            <form action="{{ route('admin.settings.certificates.letsencrypt') }}" method="POST">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Let's Encrypt</h3></div>
                    <div class="box-body">
                        <p class="text-muted small">
                            Adds a button to the Domains tab of a server that gets a free certificate for that domain, with nothing to set up by hand:
                            the panel proves the domain over port 80, adds the certificate here and renews it before it ends. The domain has to point at this machine.
                        </p>
                        <div class="checkbox checkbox-primary">
                            <input id="acme-enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', config('acme.enabled'))) checked @endif @if(!$canChange) disabled @endif>
                            <label for="acme-enabled">Let people get free certificates for their domains</label>
                        </div>
                        @if(!config('acme.enabled'))
                            <div class="checkbox checkbox-primary">
                                <input id="acme-agree" type="checkbox" name="agree" value="1" @if(!$canChange) disabled @endif>
                                <label for="acme-agree">I agree to the <a href="https://letsencrypt.org/repository/" target="_blank" rel="noopener noreferrer">Let's Encrypt Subscriber Agreement</a></label>
                            </div>
                        @endif
                        <div class="form-group">
                            <label class="control-label" for="acme-email">Email address (optional)</label>
                            <input id="acme-email" type="email" name="email" class="form-control" value="{{ old('email', config('acme.email')) }}" @if(!$canChange) disabled @endif>
                            <p class="text-muted small">Only for notices from Let's Encrypt about certificates that are about to end.</p>
                        </div>
                        <div class="checkbox checkbox-primary no-margin-bottom">
                            <input id="acme-staging" type="checkbox" name="staging" value="1" @if(old('staging', config('acme.staging'))) checked @endif @if(!$canChange) disabled @endif>
                            <label for="acme-staging">Test mode (Let's Encrypt staging: certificates nothing trusts, no limits)</label>
                        </div>
                        <p class="small" style="margin-top: 10px;">
                            @if($edge && in_array('http', $edge['features'], true))
                                <span class="label label-success">Port 80 is answered</span> by panel-edge.
                            @else
                                <span class="label label-warning">Port 80 is not answered by panel-edge</span>
                                <span class="text-muted">Set <code>HTTP_LISTEN=:80</code> in <code>/etc/panel-edge.env</code> (the web server has to move off port 80, see tools/panel-edge/README.md).</span>
                            @endif
                        </p>
                    </div>
                    @if($canChange)
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                        </div>
                    @endif
                </div>
            </form>
            @if($canChange)
                <form action="{{ route('admin.settings.certificates') }}" method="POST" enctype="multipart/form-data" autocomplete="off">
                    <div class="box">
                        <div class="box-header with-border"><h3 class="box-title">Add a certificate</h3></div>
                        <div class="box-body">
                            <div class="form-group">
                                <label class="control-label" for="name">Name</label>
                                <input id="name" type="text" name="name" class="form-control" required maxlength="100" value="{{ old('name') }}" placeholder="panel.example.com">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="certificate">Certificate</label>
                                <textarea id="certificate" name="certificate" rows="5" class="form-control" spellcheck="false" placeholder="-----BEGIN CERTIFICATE-----&#10;(your certificate, then the intermediate certificates)&#10;-----END CERTIFICATE-----">{{ old('certificate') }}</textarea>
                                <input type="file" name="certificate_file" class="small" style="margin-top: 4px;" accept=".pem,.crt,.cer,.txt">
                                <p class="text-muted small">Paste it or choose the file (fullchain.pem). Your own certificate comes first, then the intermediates.</p>
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="private_key">Private key</label>
                                <textarea id="private_key" name="private_key" rows="4" class="form-control" spellcheck="false" autocomplete="off" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
                                <input type="file" name="private_key_file" class="small" style="margin-top: 4px;" accept=".pem,.key,.txt">
                                <p class="text-muted small">Stored encrypted and never shown again.</p>
                            </div>
                            <div class="form-group no-margin-bottom">
                                <label class="control-label" for="passphrase">Passphrase of the key</label>
                                <input id="passphrase" type="password" name="passphrase" class="form-control" autocomplete="new-password" placeholder="Only if the key has one">
                            </div>
                        </div>
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            <button type="submit" class="btn btn-sm btn-primary pull-right">Add</button>
                        </div>
                    </div>
                </form>
            @else
                <div class="box"><div class="box-body"><p class="text-muted no-margin">You may look at the certificates, not change them.</p></div></div>
            @endif
        </div>
    </div>
@endsection
