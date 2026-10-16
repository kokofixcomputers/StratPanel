@extends('layouts.admin')

@section('title')
    {{ $node->name }}: Certificate
@endsection

@section('content-header')
    <h1>{{ $node->name }}<small>The https certificate of this node.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.nodes') }}">Nodes</a></li>
        <li><a href="{{ route('admin.nodes.view', $node->id) }}">{{ $node->name }}</a></li>
        <li class="active">Certificate</li>
    </ol>
@endsection

@section('content')
@include('admin.nodes.partials.navigation')
@php($canChange = Auth::user()->hasPermission('nodes.certificate'))
<div class="row">
    <div class="col-md-6">
        <div class="box box-primary">
            <div class="box-header with-border"><h3 class="box-title">What the node has</h3></div>
            <div class="box-body">
                @if(isset($live['error']))
                    <div class="alert alert-warning no-margin-bottom">
                        The node could not be asked: {{ $live['error'] }}
                        <br><small>The certificate needs the Stratosphere version of Wings, which has the <code>/api/certificates</code> route.</small>
                    </div>
                @elseif(!$live['present'])
                    <p class="no-margin">It has no certificate. Browsers will not trust it over https until it gets one.</p>
                @else
                    @php($c = $live['certificate'])
                    <table class="table no-margin">
                        <tr><th style="width: 30%;">Covers</th><td>@foreach($c['names'] as $name)<code>{{ $name }}</code> @endforeach</td></tr>
                        <tr><th>From</th><td>
                            @if($c['source'] === 'pushed') the panel (this page)
                            @elseif($c['source'] === 'file') a file on the node
                            @else a temporary certificate nothing trusts, made by the node until it gets one @endif
                        </td></tr>
                        <tr><th>Ends</th><td>{{ \Carbon\Carbon::parse($c['not_after'])->toDayDateTimeString() }}
                            @if(\Carbon\Carbon::parse($c['not_after'])->isPast())<span class="label label-danger">Expired</span>@endif</td></tr>
                        <tr><th>Fingerprint</th><td><code class="small" style="word-break: break-all;">{{ $c['fingerprint'] }}</code></td></tr>
                    </table>
                    @if($assigned && $c['fingerprint'] !== $assigned->fingerprint)
                        <p class="text-warning small" style="margin-top: 10px;">This is not the certificate that is chosen below, press <strong>Push now</strong>.</p>
                    @endif
                @endif
            </div>
        </div>
        <div class="box">
            <div class="box-header with-border"><h3 class="box-title">The panel and this node</h3></div>
            <div class="box-body">
                <p class="no-margin">
                    The panel reaches this node over <code>{{ $node->scheme }}</code> at <code>{{ $node->fqdn }}:{{ $node->daemonListen }}</code>.
                    @if($node->certificate_pushed_at)
                        <br>Last given a certificate {{ $node->certificate_pushed_at->diffForHumans() }}.
                    @endif
                    @if($node->certificate_error)
                        <br><span class="text-danger">Last problem: {{ $node->certificate_error }}</span>
                    @endif
                </p>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <form action="{{ route('admin.nodes.view.certificate', $node->id) }}" method="POST">
            <div class="box">
                <div class="box-header with-border"><h3 class="box-title">Certificate for this node</h3></div>
                <div class="box-body">
                    <div class="form-group">
                        <label class="control-label" for="certificate">Use</label>
                        <select id="certificate" name="certificate" class="form-control" @if(!$canChange) disabled @endif>
                            <option value="" @if(!$assigned && !$node->certificate_auto) selected @endif>None</option>
                            <option value="auto" @if($node->certificate_auto && $node->certificate_id === null) selected @endif>
                                The one that covers {{ $node->fqdn }}@if($candidate) (now: {{ $candidate->name }})@else (none does yet)@endif
                            </option>
                            @foreach($certificates as $certificate)
                                <option value="{{ $certificate->id }}" @if($node->certificate_id === $certificate->id) selected @endif>
                                    {{ $certificate->name }} ({{ implode(', ', array_slice($certificate->domains, 0, 3)) }}){{ in_array($certificate->id, $covering) ? '' : ' - does not cover this node' }}
                                </option>
                            @endforeach
                        </select>
                        <p class="text-muted small">
                            The certificates are the ones added under <a href="{{ route('admin.settings.certificates') }}">Settings &rarr; Certificates</a>.
                            "The one that covers" follows renewals by itself: a new certificate is given to the node within the hour.
                        </p>
                    </div>
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
            <form action="{{ route('admin.nodes.view.certificate.push', $node->id) }}" method="POST" id="push-form">
                {!! csrf_field() !!}
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Give it to the node</h3></div>
                    <div class="box-body">
                        <p class="text-muted">
                            The certificate and its private key are sent to the node, it uses them from the next connection on, nothing is restarted.
                            @if($node->scheme !== 'https')
                                This node is reached over <strong>http</strong> now.
                            @endif
                        </p>
                        @if(session('needs_confirmation') || $node->scheme !== 'https' || !$node->certificate_pushed_at)
                            <div class="checkbox checkbox-primary">
                                <input id="confirm" type="checkbox" name="confirm" value="1" @if(session('needs_confirmation')) checked @endif>
                                <label for="confirm">
                                    The first time, give it without checking who answers. The key is sent to whatever is at
                                    <code>{{ $node->fqdn }}</code>: fine on a network you trust, not over the open internet if you are not sure the name is yours.
                                </label>
                            </div>
                        @endif
                    </div>
                    <div class="box-footer">
                        <button type="submit" class="btn btn-sm btn-default" @if(!$assigned) disabled @endif>Push now</button>
                        <button type="submit" formaction="{{ route('admin.nodes.view.certificate.enable', $node->id) }}" class="btn btn-sm btn-success pull-right" @if(!$assigned) disabled @endif
                                title="Gives it the certificate and then switches the panel to https for this node when that works">
                            Enable https on this node
                        </button>
                    </div>
                </div>
            </form>
        @endif
    </div>
</div>
@endsection
