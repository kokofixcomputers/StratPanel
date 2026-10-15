@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'branding'])

@section('title')
    Branding
@endsection

@section('content-header')
    <h1>Branding<small>The favicon, announcements and links of your Stratosphere.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <form action="{{ route('admin.settings.branding') }}" method="POST" enctype="multipart/form-data">
        <div class="row">
            <div class="col-xs-12">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Favicon</h3>
                    </div>
                    <div class="box-body">
                        <div class="row">
                            <div class="col-md-8">
                                <input type="file" name="favicon" accept=".png,.ico,.gif,.jpg,.jpeg,image/png,image/x-icon,image/gif,image/jpeg" class="form-control" />
                                <p class="text-muted"><small>PNG, ICO, GIF or JPG up to 512 KB. A square PNG of at least 64 by 64 pixels works best. It is used on every page of the panel, including this one.</small></p>
                            </div>
                            <div class="col-md-4">
                                @if($favicon)
                                    <img src="{{ $favicon }}" alt="Current favicon" style="width: 32px; height: 32px; image-rendering: pixelated; vertical-align: middle;" />
                                    <label style="margin-left: 10px; font-weight: normal;">
                                        <input type="checkbox" name="remove_favicon" value="1" /> Go back to the default
                                    </label>
                                @else
                                    <p class="text-muted"><small>The default favicon is in use.</small></p>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-xs-12">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Announcements</h3>
                        <div class="box-tools">
                            <button type="button" class="btn btn-xs btn-success" id="add-announcement"><i class="fa fa-plus"></i> Add announcement</button>
                        </div>
                    </div>
                    <div class="box-body">
                        <p class="text-muted"><small>Shown above the servers on the dashboard, in the order listed. People can dismiss an announcement, one that you edit shows again.</small></p>
                        <div id="announcements"></div>
                        <p class="text-muted" id="no-announcements" style="display: none;">There are no announcements.</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-xs-12">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Custom links</h3>
                        <div class="box-tools">
                            <button type="button" class="btn btn-xs btn-success" id="add-link"><i class="fa fa-plus"></i> Add link</button>
                        </div>
                    </div>
                    <div class="box-body">
                        <p class="text-muted"><small>Links to your own site, a status page, a Discord invite or the rules. Choose where each one appears: in the sidebar of a server, the top bar or the footer of the panel.</small></p>
                        <div id="links"></div>
                        <p class="text-muted" id="no-links" style="display: none;">There are no links.</p>
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </div>
        </div>
    </form>
@endsection

@section('footer-scripts')
    @parent
    <script>
        (function () {
            var announcements = @json(old('announcements', $announcements));
            var links = @json(old('links', $links));
            var types = @json($types);
            var locations = @json($locations);
            var next = 0;

            function esc(value) {
                return $('<div>').text(value == null ? '' : value).html().replace(/"/g, '&quot;');
            }

            function options(list, selected) {
                return $.map(list, function (label, key) {
                    var value = $.isArray(list) ? label : key;
                    return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
                }).join('');
            }

            function check(name, label, on) {
                return '<label style="font-weight: normal; margin-right: 15px;"><input type="checkbox" name="' + name + '" value="1"' + (on ? ' checked' : '') + '> ' + label + '</label>';
            }

            function row(kind, content) {
                return $('<div class="well well-sm" style="margin-bottom: 10px;">' + content +
                    '<button type="button" class="btn btn-xs btn-danger pull-right remove-row"><i class="fa fa-trash"></i> Remove</button><div class="clearfix"></div></div>');
            }

            function addAnnouncement(a) {
                a = a || { type: 'info', enabled: true, dismissible: true };
                var n = 'announcements[' + (next++) + ']';
                $('#announcements').append(row('a',
                    '<input type="hidden" name="' + n + '[id]" value="' + esc(a.id) + '">' +
                    '<div class="row">' +
                    '<div class="col-md-3 form-group"><label class="control-label">Title</label><input type="text" class="form-control" name="' + n + '[title]" maxlength="100" value="' + esc(a.title) + '"></div>' +
                    '<div class="col-md-2 form-group"><label class="control-label">Style</label><select class="form-control" name="' + n + '[type]">' + options(types, a.type) + '</select></div>' +
                    '<div class="col-md-7 form-group"><label class="control-label">Message</label><textarea class="form-control" rows="2" maxlength="1000" name="' + n + '[message]" required>' + esc(a.message) + '</textarea></div>' +
                    '</div><div class="row">' +
                    '<div class="col-md-3 form-group"><label class="control-label">Link text</label><input type="text" class="form-control" name="' + n + '[link_label]" maxlength="50" placeholder="Read more" value="' + esc(a.link_label) + '"></div>' +
                    '<div class="col-md-5 form-group"><label class="control-label">Link address</label><input type="text" class="form-control" name="' + n + '[link_url]" maxlength="500" placeholder="https://" value="' + esc(a.link_url) + '"></div>' +
                    '<div class="col-md-4" style="padding-top: 25px;">' + check(n + '[enabled]', 'Shown', a.enabled) + check(n + '[dismissible]', 'Can be dismissed', a.dismissible) + '</div>' +
                    '</div>'));
                refresh();
            }

            function addLink(l) {
                l = l || { location: 'footer', new_tab: true };
                var n = 'links[' + (next++) + ']';
                $('#links').append(row('l',
                    '<div class="row">' +
                    '<div class="col-md-3 form-group"><label class="control-label">Label</label><input type="text" class="form-control" name="' + n + '[label]" maxlength="50" required value="' + esc(l.label) + '"></div>' +
                    '<div class="col-md-4 form-group"><label class="control-label">Address</label><input type="text" class="form-control" name="' + n + '[url]" maxlength="500" placeholder="https://" required value="' + esc(l.url) + '"></div>' +
                    '<div class="col-md-2 form-group"><label class="control-label">Shown in</label><select class="form-control" name="' + n + '[location]">' + options(locations, l.location) + '</select></div>' +
                    '<div class="col-md-3" style="padding-top: 25px;">' + check(n + '[new_tab]', 'Open in a new tab', l.new_tab) + '</div>' +
                    '</div>'));
                refresh();
            }

            function refresh() {
                $('#no-announcements').toggle($('#announcements').children().length === 0);
                $('#no-links').toggle($('#links').children().length === 0);
            }

            $(document).on('click', '.remove-row', function () { $(this).closest('.well').remove(); refresh(); });
            $('#add-announcement').on('click', function () { addAnnouncement(); });
            $('#add-link').on('click', function () { addLink(); });

            $.each(announcements, function (_, a) { addAnnouncement(a); });
            $.each(links, function (_, l) { addLink(l); });
            refresh();
        })();
    </script>
@endsection
