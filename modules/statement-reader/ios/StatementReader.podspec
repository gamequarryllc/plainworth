Pod::Spec.new do |s|
  s.name           = 'StatementReader'
  s.version        = '1.0.0'
  s.summary        = 'Reads the text of a statement (PDF or photo) on the device.'
  s.description    = 'Text from PDFs with PDFKit, from photos with Vision, and an optional pass with the on-device Apple Intelligence model. Nothing leaves the device.'
  s.license        = 'UNLICENSED'
  s.author         = 'Game Quarry LLC'
  s.homepage       = 'https://github.com/gamequarryllc/plainworth'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/gamequarryllc/plainworth.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'PDFKit', 'Vision', 'UIKit'
  # Only on iOS 26 and later; older iPhones must still open the app.
  s.weak_frameworks = 'FoundationModels'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
