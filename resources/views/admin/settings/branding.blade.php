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
                        <div class="bx-favicon">
                            <div class="bx-favicon-box" id="favicon-box">
                                @if($favicon)
                                    <img src="{{ $favicon }}" alt="Current favicon" id="favicon-img">
                                @else
                                    <i class="fa fa-picture-o" id="favicon-placeholder"></i>
                                @endif
                            </div>
                            <div>
                                <label class="btn btn-default btn-sm bx-file">
                                    <i class="fa fa-upload"></i> Choose image
                                    <input type="file" name="favicon" id="favicon-input" accept=".png,.ico,.gif,.jpg,.jpeg,image/png,image/x-icon,image/gif,image/jpeg">
                                </label>
                                <span class="text-muted" id="favicon-name" style="margin-left: 8px; font-size: 12px;">
                                    {{ $favicon ? 'A custom favicon is in use.' : 'The default favicon is in use.' }}
                                </span>
                                <p class="bx-hint" style="margin: 8px 0 0;">PNG, ICO, GIF or JPG up to 512 KB. A square PNG of at least 64 by 64 pixels works best. It is used on every page of the panel, including this one.</p>
                                @if($favicon)
                                    <div style="margin-top: 10px;">
                                        <div class="checkbox checkbox-primary no-margin-bottom">
                                            <input id="remove-favicon" type="checkbox" name="remove_favicon" value="1">
                                            <label for="remove-favicon">Go back to the default favicon</label>
                                        </div>
                                    </div>
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
                            <button type="button" class="btn btn-default btn-xs" id="add-announcement"><i class="fa fa-plus"></i> Add announcement</button>
                        </div>
                    </div>
                    <div class="box-body">
                        <p class="bx-hint">Shown above the servers on the dashboard, in the order listed. People can dismiss an announcement, one that you edit shows again.</p>
                        <div id="announcements"></div>
                        <div class="bx-empty" id="no-announcements" style="display: none;"><i class="fa fa-bullhorn"></i>There are no announcements yet.</div>
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
                            <button type="button" class="btn btn-default btn-xs" id="add-link"><i class="fa fa-plus"></i> Add link</button>
                        </div>
                    </div>
                    <div class="box-body">
                        <p class="bx-hint">Links to your own site, a status page, a Discord invite or the rules. Choose where each one appears: in the sidebar of a server, the top bar or the footer of the panel.</p>
                        <div id="links"></div>
                        <div class="bx-empty" id="no-links" style="display: none;"><i class="fa fa-link"></i>There are no custom links yet.</div>
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save changes</button>
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
            var icons = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', danger: 'fa-exclamation-circle' };
            var next = 0;

            function esc(value) {
                return $('<div>').text(value == null ? '' : value).html().replace(/"/g, '&quot;');
            }

            function cap(word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }

            function sw(name, label, on) {
                var id = 'cb' + (next++);
                return '<div class="checkbox checkbox-primary no-margin-bottom" style="display: inline-block; margin: 0 24px 0 0;">' +
                    '<input id="' + id + '" name="' + name + '" type="checkbox" value="1"' + (on ? ' checked' : '') + '>' +
                    '<label for="' + id + '">' + label + '</label></div>';
            }

            function seg(name, options, selected, dots) {
                return '<div class="seg">' + $.map(options, function (label, key) {
                    var value = $.isArray(options) ? label : key;
                    return '<label class="seg-opt"><input type="radio" name="' + name + '" value="' + value + '"' + (value === selected ? ' checked' : '') + '>' +
                        '<span>' + (dots ? '<i class="dot dot-' + value + '"></i>' : '') + esc($.isArray(options) ? cap(label) : label) + '</span></label>';
                }).join('') + '</div>';
            }

            function card(title, body, preview) {
                return $('<div class="bx-item">' +
                    '<div class="bx-item-head"><span class="bx-item-title">' + title + '</span>' +
                    '<button type="button" class="bx-icon-btn bx-up" title="Move up"><i class="fa fa-arrow-up"></i></button>' +
                    '<button type="button" class="bx-icon-btn bx-down" title="Move down"><i class="fa fa-arrow-down"></i></button>' +
                    '<button type="button" class="bx-icon-btn danger bx-remove" title="Remove"><i class="fa fa-trash"></i></button></div>' +
                    '<div class="bx-item-body">' + body + '</div>' + (preview || '') + '</div>');
            }

            function addAnnouncement(a) {
                a = a || { type: 'info', enabled: true, dismissible: true };
                var n = 'announcements[' + (next++) + ']';
                var el = card('Announcement',
                    '<input type="hidden" name="' + n + '[id]" value="' + esc(a.id) + '">' +
                    '<div class="row">' +
                    '<div class="col-md-4 form-group"><label class="control-label">Title <span class="text-muted">(optional)</span></label><input type="text" class="form-control f-title" name="' + n + '[title]" maxlength="100" value="' + esc(a.title) + '"></div>' +
                    '<div class="col-md-8 form-group"><label class="control-label">Message</label><textarea class="form-control f-message" rows="2" maxlength="1000" name="' + n + '[message]" required>' + esc(a.message) + '</textarea></div>' +
                    '</div><div class="row">' +
                    '<div class="col-md-12 form-group"><label class="control-label">Style</label><div>' + seg(n + '[type]', types, a.type, true) + '</div></div>' +
                    '</div><div class="row">' +
                    '<div class="col-md-4 form-group"><label class="control-label">Link text <span class="text-muted">(optional)</span></label><input type="text" class="form-control f-link-label" name="' + n + '[link_label]" maxlength="50" placeholder="Read more" value="' + esc(a.link_label) + '"></div>' +
                    '<div class="col-md-8 form-group"><label class="control-label">Link address</label><input type="text" class="form-control" name="' + n + '[link_url]" maxlength="500" placeholder="https://" value="' + esc(a.link_url) + '"></div>' +
                    '</div><div class="form-group">' +
                    sw(n + '[enabled]', 'Shown on the dashboard', a.enabled) + sw(n + '[dismissible]', 'People can dismiss it', a.dismissible) + '</div>',
                    '<div class="bx-preview"><i class="fa"></i><div><strong class="p-title"></strong><span class="p-message"></span> <span class="bx-link p-link"></span></div></div>');
                el.addClass('is-announcement');
                $('#announcements').append(el);
                paint(el);
                refresh();
            }

            function paint(el) {
                var type = el.find('input[type=radio]:checked').val() || 'info';
                var preview = el.find('.bx-preview');
                preview.attr('class', 'bx-preview t-' + type).find('i.fa').attr('class', 'fa ' + icons[type]);
                var title = el.find('.f-title').val();
                preview.find('.p-title').text(title).toggle(!!title);
                preview.find('.p-message').text(el.find('.f-message').val() || 'Your message shows up here.');
                preview.find('.p-link').text(el.find('.f-link-label').val());
                preview.toggleClass('bx-off', !el.find('input[name$="[enabled]"]').is(':checked'));
                el.find('.bx-item-title').text(title || 'Announcement');
            }

            function addLink(l) {
                l = l || { location: 'footer', new_tab: true };
                var n = 'links[' + (next++) + ']';
                var el = card('Link',
                    '<div class="row">' +
                    '<div class="col-md-4 form-group"><label class="control-label">Label</label><input type="text" class="form-control f-label" name="' + n + '[label]" maxlength="50" required value="' + esc(l.label) + '"></div>' +
                    '<div class="col-md-8 form-group"><label class="control-label">Address</label><input type="text" class="form-control" name="' + n + '[url]" maxlength="500" placeholder="https://" required value="' + esc(l.url) + '"></div>' +
                    '</div><div class="row"><div class="col-md-12 form-group"><label class="control-label">Shown in</label><div>' + seg(n + '[location]', locations, l.location, false) + '</div></div></div>' +
                    '<div class="form-group">' + sw(n + '[new_tab]', 'Open in a new tab', l.new_tab) + '</div>');
                el.addClass('is-link');
                $('#links').append(el);
                el.find('.bx-item-title').text(l.label || 'Link');
                refresh();
            }

            function refresh() {
                $('#no-announcements').toggle($('#announcements').children().length === 0);
                $('#no-links').toggle($('#links').children().length === 0);
                $('#announcements, #links').each(function () {
                    var items = $(this).children();
                    items.each(function (index) {
                        $(this).find('.bx-up').prop('disabled', index === 0);
                        $(this).find('.bx-down').prop('disabled', index === items.length - 1);
                    });
                });
            }

            $(document).on('click', '.bx-remove', function () { $(this).closest('.bx-item').remove(); refresh(); });
            $(document).on('click', '.bx-up', function () { var item = $(this).closest('.bx-item'); item.prev().before(item); refresh(); });
            $(document).on('click', '.bx-down', function () { var item = $(this).closest('.bx-item'); item.next().after(item); refresh(); });
            $(document).on('input change', '.is-announcement', function () { paint($(this)); });
            $(document).on('input', '.is-link .f-label', function () { $(this).closest('.bx-item').find('.bx-item-title').text($(this).val() || 'Link'); });
            $('#add-announcement').on('click', function () { addAnnouncement(); });
            $('#add-link').on('click', function () { addLink(); });

            // Shows the chosen favicon right away, before anything is saved.
            $('#favicon-input').on('change', function () {
                var file = this.files && this.files[0];
                if (!file) return;
                $('#favicon-name').text(file.name + ' will replace the favicon when you save.');
                var url = URL.createObjectURL(file);
                $('#favicon-placeholder').remove();
                var img = $('#favicon-img');
                if (!img.length) img = $('<img id="favicon-img" alt="">').appendTo('#favicon-box');
                img.attr('src', url);
            });

            $.each(announcements, function (_, a) { addAnnouncement(a); });
            $.each(links, function (_, l) { addLink(l); });
            refresh();
        })();
    </script>
@endsection
