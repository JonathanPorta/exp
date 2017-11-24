/**
 * @flow
 */

import { Api, Project, FormData } from 'xdl';
import log from '../log';
import * as table from '../commands/utils/cli-table';

const HORIZ_CELL_WIDTH_SMALL = 15;
const HORIZ_CELL_WIDTH_BIG = 40;

export default (program: any) => {
  program
    .command('publish:history [project-dir]')
    .alias('ph')
    .description('View a log of your published releases.')
    .option('-c, --release-channel [channel-name]', 'Filter by release channel')
    .option(
      '-count, --count [number-of-logs]',
      'Number of logs to view, maximum 100, default 5.',
      parseInt
    )
    .option(
      '-p, --platform [ios|android]',
      'Filter by platform, android or ios.'
    )
    .allowNonInteractive()
    .asyncActionProjectDir(async (projectDir, options) => {
      if (
        options.count &&
        (isNaN(options.count) || options.count < 1 || options.count > 100)
      ) {
        log.error('-n must be a number between 1 and 100 inclusive');
        process.exit(1);
      }

      let formData = new FormData();
      formData.append('queryType', 'history');
      formData.append('slug', await Project.getSlugAsync(projectDir, options));
      // if (options.releaseChannel) {
      //   formData.append('releaseChannel', options.releaseChannel);
      // }
      if (options.count) {
        formData.append('count', options.count);
      }
      if (options.platform) {
        formData.append('platform', options.platform);
      }

      let result = await Api.callMethodAsync(
        'publishInfo',
        null,
        'post',
        null,
        {
          formData
        }
      );

      if (result.queryResult && result.queryResult.length > 0) {
        // Print general publication info
        let sampleItem = result.queryResult[0]; // get a sample item
        let generalTableString = table.printTableJson(
          {
            fullName: sampleItem.fullName,
            ...(sampleItem.channel ? { channel: sampleItem.channel } : null)
          },
          'General Info'
        );
        console.log(generalTableString);

        // Print info specific to each publication
        let headers = [
          'publicationId',
          'appVersion',
          'sdkVersion',
          'publishedTime',
          'platform'
        ];
        // if (options.releaseChannel) {
        //   headers.push('channelId');
        // }

        // colWidths contains the cell size of each header
        let colWidths = [];
        let bigCells = new Set(['publicationId', 'channelId', 'publishedTime']);
        headers.forEach(header => {
          bigCells.has(header)
            ? colWidths.push(HORIZ_CELL_WIDTH_BIG)
            : colWidths.push(HORIZ_CELL_WIDTH_SMALL);
        });
        let tableString = table.printTableJsonArray(
          headers,
          result.queryResult,
          colWidths
        );
        console.log(tableString);
      } else {
        log.error('No records found matching your query.');
      }
    });
  program
    .command('publish:details [project-dir]')
    .alias('pd')
    .description('View the details of a published release.')
    .option('--publish-id [publish-id]', 'Publication id.')
    .allowNonInteractive()
    .asyncActionProjectDir(async (projectDir, options) => {
      if (!options.publishId) {
        log.error('publishId must be specified.');
        process.exit(1);
      }

      let formData = new FormData();
      formData.append('queryType', 'details');
      formData.append('publishId', options.publishId);
      formData.append('slug', await Project.getSlugAsync(projectDir, options));

      let result = await Api.callMethodAsync(
        'publishInfo',
        null,
        'post',
        null,
        {
          formData
        }
      );

      if (result.queryResult) {
        let queryResult = result.queryResult;
        let manifest = queryResult.manifest;
        delete queryResult.manifest;

        // Print general release info
        let generalTableString = table.printTableJson(
          queryResult,
          'Release Description'
        );
        console.log(generalTableString);

        // Print manifest info
        let manifestTableString = table.printTableJson(
          manifest,
          'Manifest Details'
        );
        console.log(manifestTableString);
      } else {
        log.error('No records found matching your query.');
      }
    });
};
