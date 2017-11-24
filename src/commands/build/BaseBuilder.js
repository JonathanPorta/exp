/**
 * @flow
 */

import { Project, ProjectUtils } from 'xdl';

import log from '../../log';
import { action as publishAction } from '../publish';

import BuildError from './BuildError';

type BuilderOptions = {
  wait: boolean,
  clearCredentials: boolean,
  type?: string,
  releaseChannel?: string
};

export default class BaseBuilder {
  projectDir: string = '';
  options: BuilderOptions = {
    wait: false,
    clearCredentials: false
  };
  run: () => Promise<void>;

  constructor(projectDir: string, options: BuilderOptions) {
    this.projectDir = projectDir;
    this.options = options;
  }

  async command() {
    try {
      await this._checkProjectConfig();
      await this.run();
    } catch (e) {
      if (!(e instanceof BuildError)) {
        throw e;
      } else {
        log.error(e.message);
        process.exit(1);
      }
    }
  }

  async _checkProjectConfig(): Promise<void> {
    let { exp } = await ProjectUtils.readConfigJsonAsync(this.projectDir);
    if (exp.isDetached) {
      log.error(`\`exp build\` is not supported for detached projects.`);
      process.exit(1);
      return;
    }
  }

  async checkStatus(current: boolean = true): Promise<void> {
    await this._checkProjectConfig();

    log('Checking if current build exists...\n');

    const buildStatus = await Project.buildAsync(this.projectDir, {
      mode: 'status',
      current
    });

    if (buildStatus.err) {
      throw new Error('Error getting current build status for this project.');
    }

    if (buildStatus.jobs && buildStatus.jobs.length) {
      log.raw();
      log('============');
      log('Build Status');
      log('============\n');
      buildStatus.jobs.forEach(j => {
        let platform;
        if (j.platform === 'ios') {
          platform = 'iOS';
        } else {
          platform = 'Android';
        }

        let status;
        switch (j.status) {
          case 'pending':
            status = 'Build waiting in queue...';
            break;
          case 'started':
            status = 'Build started...';
            break;
          case 'in-progress':
            status = 'Build in progress...';
            break;
          case 'finished':
            status = 'Build finished.';
            break;
          case 'errored':
            status = 'There was an error with this build.';
            if (buildStatus.id) {
              status += `

When requesting support, please provide this build ID:

${buildStatus.id}
`;
            }
            break;
          default:
            status = '';
            break;
        }

        if (j.status !== 'finished') {
          log(`${platform}: ${status}`);
        } else {
          log(`${platform}:`);
          switch (j.platform) {
            case 'ios':
              if (!j.artifacts) {
                log(`Problem getting IPA URL. Please try build again.`);
                break;
              }
              log(`IPA: ${j.artifacts.url}\n`);
              break;
            case 'android':
              if (!j.artifacts) {
                log(`Problem getting APK URL. Please try build again.`);
                break;
              }
              log(`APK: ${j.artifacts.url}\n`);
              break;
          }
        }
      });

      throw new BuildError(
        'Cannot start new build, as there is a build in progress.'
      );
    }

    log('No currently active or previous builds for this project.');
  }

  async publish() {
    // Begin publish
    log('Starting build process...');

    //run publish -- in future, we should determine whether we NEED to do this
    const { ids: expIds, url, err } = await publishAction(this.projectDir, {
      // releaseChannel: this.options.releaseChannel
    });

    if (err) {
      throw new BuildError(
        `No url was returned from publish. Please try again.\n${err}`
      );
    } else if (!url || url === '') {
      throw new BuildError(
        'No url was returned from publish. Please try again.'
      );
    }

    return expIds;
  }

  async build(expIds: Array<string>, platform: string) {
    log('Building...');

    let opts = {
      mode: 'create',
      expIds,
      platform
      // releaseChannel: this.options.releaseChannel,
    };

    if (platform === 'ios') {
      opts = {
        ...opts,
        type: this.options.type
      };
    }

    // call out to build api here with url
    const buildResp = await Project.buildAsync(this.projectDir, opts);

    if (this.options.wait) {
      const { ipaUrl, apkUrl, buildErr } = buildResp;
      // do some stuff here
      // FIXME(perry) this is duplicate code to the checkStatus function
      if (buildErr) {
        throw new BuildError(`Build failed with error.\n${buildErr}`);
      } else if (!ipaUrl || ipaUrl === '' || !apkUrl || apkUrl === '') {
        throw new BuildError(
          'No url was returned from the build process. Please try again.'
        );
      }

      log(`IPA Url: ${ipaUrl}`);
      log(`APK Url: ${apkUrl}`);

      log('Successfully built standalone app!');
    } else {
      log('Build started, it may take a few minutes to complete.');

      if (buildResp.id) {
        log(`Build ID: ${buildResp.id}`);
      }

      log('Run `exp build:status` to monitor it.');
    }
  }
}
