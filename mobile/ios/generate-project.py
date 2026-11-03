"""Generate a dependency-free Xcode project with two separate app targets.

Regeneration replaces project build settings. Signing is supplied when archiving.
The generated project and shared schemes are committed source artifacts.
"""
from pathlib import Path
import hashlib
import json
import plistlib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
objects = {}
def uid(name): return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def add(label, isa, **fields):
    key = uid(label)
    objects[key] = dict(isa=isa, **fields)
    return key
def serialize(value, level=0):
    if isinstance(value, dict):
        return '{\n' + ''.join('\t'*(level+1)+json.dumps(str(k))+' = '+serialize(v,level+1)+';\n' for k,v in value.items())+'\t'*level+'}'
    if isinstance(value, list): return '('+', '.join(serialize(v,level+1) for v in value)+')'
    return json.dumps(str(value))
def config_list(name, entries):
    ids=[add(name+kind,'XCBuildConfiguration',name=kind,buildSettings=settings) for kind,settings in entries]
    return add(name+'list','XCConfigurationList',buildConfigurations=ids,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')

source=add('source','PBXFileReference',lastKnownFileType='sourcecode.swift',path='Sources/OryaApp.swift',sourceTree='<group>')
address=add('address','PBXFileReference',lastKnownFileType='sourcecode.swift',path='Sources/BackendAddress.swift',sourceTree='<group>')
privacy=add('privacy','PBXFileReference',lastKnownFileType='text.xml',path='PrivacyInfo.xcprivacy',sourceTree='<group>')
localization_children=[]
for language in ['en','fr']:
    localization_children.append(add('info-'+language,'PBXFileReference',lastKnownFileType='text.plist.strings',name=language,path=f'{language}.lproj/InfoPlist.strings',sourceTree='<group>'))
localization=add('info-localization','PBXVariantGroup',children=localization_children,name='InfoPlist.strings',sourceTree='<group>')
products=[];targets=[];assets=[]
project_configs=config_list('Project',[(kind,dict(CLANG_ENABLE_MODULES='YES',IPHONEOS_DEPLOYMENT_TARGET='16.0',SDKROOT='iphoneos',SWIFT_VERSION='5.0',ONLY_ACTIVE_ARCH='YES' if kind=='Debug' else 'NO')) for kind in ['Debug','Release']])
for target,role,name,bundle in [('OryaParking','driver','Orya Parking','com.orya.parking.beta'),('OryaOperations','operations','Orya Operations','com.orya.operations.beta')]:
    product=add(target+'product','PBXFileReference',explicitFileType='wrapper.application',includeInIndex=0,path=target+'.app',sourceTree='BUILT_PRODUCTS_DIR');products.append(product)
    asset=add(target+'assets','PBXFileReference',lastKnownFileType='folder.assetcatalog',path=target+'/Assets.xcassets',sourceTree='<group>');assets.append(asset)
    source_build=add(target+'source','PBXBuildFile',fileRef=source)
    address_build=add(target+'address','PBXBuildFile',fileRef=address)
    localization_build=add(target+'localization','PBXBuildFile',fileRef=localization)
    privacy_build=add(target+'privacy','PBXBuildFile',fileRef=privacy)
    asset_build=add(target+'resource','PBXBuildFile',fileRef=asset)
    phases=[add(target+'sources','PBXSourcesBuildPhase',buildActionMask=2147483647,files=[source_build,address_build],runOnlyForDeploymentPostprocessing=0),add(target+'frameworks','PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0),add(target+'resources','PBXResourcesBuildPhase',buildActionMask=2147483647,files=[asset_build,localization_build,privacy_build],runOnlyForDeploymentPostprocessing=0)]
    configs=[]
    for kind in ['Debug','Release']:
        settings=dict(PRODUCT_NAME='$(TARGET_NAME)',PRODUCT_BUNDLE_IDENTIFIER=bundle,DEVELOPMENT_TEAM='',CODE_SIGN_STYLE='Automatic',TARGETED_DEVICE_FAMILY='1,2',SUPPORTED_PLATFORMS='iphoneos iphonesimulator',SUPPORTS_MACCATALYST='NO',GENERATE_INFOPLIST_FILE='NO',INFOPLIST_FILE=f'{target}/Info-{kind}.plist',ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',MARKETING_VERSION='0.1.0',CURRENT_PROJECT_VERSION='1',SWIFT_VERSION='5.0',IPHONEOS_DEPLOYMENT_TARGET='16.0',LD_RUNPATH_SEARCH_PATHS='$(inherited) @executable_path/Frameworks',SWIFT_OPTIMIZATION_LEVEL='-Onone' if kind=='Debug' else '-O',SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG $(inherited)' if kind=='Debug' else '$(inherited)')
        configs.append((kind,settings))
        info=dict(CFBundleDevelopmentRegion='en',CFBundleDisplayName=name,CFBundleExecutable='$(EXECUTABLE_NAME)',CFBundleIdentifier='$(PRODUCT_BUNDLE_IDENTIFIER)',CFBundleInfoDictionaryVersion='6.0',CFBundleName='$(PRODUCT_NAME)',CFBundlePackageType='APPL',CFBundleShortVersionString='$(MARKETING_VERSION)',CFBundleVersion='$(CURRENT_PROJECT_VERSION)',LSRequiresIPhoneOS=True,UILaunchScreen={},UISupportedInterfaceOrientations=['UIInterfaceOrientationPortrait'],**{'UISupportedInterfaceOrientations~ipad':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight']},OryaRole=role,OryaBackendOrigin='https://orya-parking-production.up.railway.app')
        if role=='operations':
            info['NSCameraUsageDescription']='Scan driver parking passes to verify entry at your assigned site.'
        if kind=='Debug':
            info['NSAppTransportSecurity']={'NSAllowsLocalNetworking':True}
            info['NSLocalNetworkUsageDescription']='Connect to your Orya test server on your local Wi-Fi network.'
        folder=ROOT/target;folder.mkdir(exist_ok=True)
        (folder/f'Info-{kind}.plist').write_bytes(plistlib.dumps(info))
    config=config_list(target,configs)
    target_id=add(target,'PBXNativeTarget',buildConfigurationList=config,buildPhases=phases,buildRules=[],dependencies=[],name=target,productName=target,productReference=product,productType='com.apple.product-type.application');targets.append(target_id)
    scheme=ET.Element('Scheme',LastUpgradeVersion='2600',version='1.3')
    build=ET.SubElement(scheme,'BuildAction',parallelizeBuildables='YES',buildImplicitDependencies='YES')
    entries=ET.SubElement(build,'BuildActionEntries');entry=ET.SubElement(entries,'BuildActionEntry',buildForTesting='YES',buildForRunning='YES',buildForProfiling='YES',buildForArchiving='YES',buildForAnalyzing='YES')
    ref=dict(BuildableIdentifier='primary',BlueprintIdentifier=target_id,BuildableName=target+'.app',BlueprintName=target,ReferencedContainer='container:OryaMobile.xcodeproj')
    ET.SubElement(entry,'BuildableReference',**ref)
    launch=ET.SubElement(scheme,'LaunchAction',buildConfiguration='Debug',selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB',selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB',launchStyle='0',useCustomWorkingDirectory='NO',ignoresPersistentStateOnLaunch='NO',debugDocumentVersioning='YES',debugServiceExtension='internal',allowLocationSimulation='YES')
    runnable=ET.SubElement(launch,'BuildableProductRunnable',runnableDebuggingMode='0');ET.SubElement(runnable,'BuildableReference',**ref)
    ET.SubElement(scheme,'AnalyzeAction',buildConfiguration='Debug');ET.SubElement(scheme,'ArchiveAction',buildConfiguration='Release',revealArchiveInOrganizer='YES')
    schemes=ROOT/'OryaMobile.xcodeproj/xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True)
    ET.indent(scheme);ET.ElementTree(scheme).write(schemes/(target+'.xcscheme'),encoding='utf-8',xml_declaration=True)

product_group=add('products','PBXGroup',children=products,name='Products',sourceTree='<group>')
main_group=add('main','PBXGroup',children=[source,address,privacy,localization,*assets,product_group],sourceTree='<group>')
project=add('project','PBXProject',attributes=dict(BuildIndependentTargetsInParallel='YES',LastUpgradeCheck='2600',TargetAttributes={t:{'CreatedOnToolsVersion':'26.0','ProvisioningStyle':'Automatic'} for t in targets}),buildConfigurationList=project_configs,compatibilityVersion='Xcode 14.0',developmentRegion='en',hasScannedForEncodings=0,knownRegions=['en','fr','Base'],mainGroup=main_group,productRefGroup=product_group,projectDirPath='',projectRoot='',targets=targets)
root=dict(archiveVersion=1,classes={},objectVersion=56,objects=objects,rootObject=project)
(ROOT/'OryaMobile.xcodeproj/project.pbxproj').write_text('// !$*UTF8*$!\n'+serialize(root)+'\n')
print('Generated OryaMobile.xcodeproj: OryaParking and OryaOperations. Signing team remains unset.')
