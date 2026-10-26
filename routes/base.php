<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Base;
use Pterodactyl\Http\Middleware\RequireTwoFactorAuthentication;

Route::get('/', [Base\IndexController::class, 'index'])->name('index')->fallback();
Route::get('/account', [Base\IndexController::class, 'index'])
    ->withoutMiddleware(RequireTwoFactorAuthentication::class)
    ->name('account');

Route::get('/manifest.webmanifest', Base\ManifestController::class)
    ->withoutMiddleware(['auth', RequireTwoFactorAuthentication::class])
    ->name('manifest');

Route::get('/locales/locale.json', Base\LocaleController::class)
    ->withoutMiddleware(['auth', RequireTwoFactorAuthentication::class])
    ->where('namespace', '.*');

// A copy of a backup that is kept outside the node, with a signed link made by the panel (see BackupCopyService).
Route::get('/backup-copies/{copy}/download', Base\BackupCopyDownloadController::class)
    ->withoutMiddleware(['auth.session', RequireTwoFactorAuthentication::class])
    ->middleware(\Illuminate\Routing\Middleware\ValidateSignature::class)
    ->whereNumber('copy')
    ->name('backups.copy.download');

Route::get('/{react}', [Base\IndexController::class, 'index'])
    ->where('react', '^(?!(\/)?(api|auth|admin|daemon|backup-copies)).+');
